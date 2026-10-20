/**
 * FF ARENA – OPTIONAL Cloud Functions (requires Firebase Blaze plan)
 * ───────────────────────────────────────────────────────────────────
 * Payment-gateway hooks for AUTOMATIC deposits. Everything else in the platform (joining,
 * results, refunds, withdrawals, manual UPI deposits) works on the free Spark plan because it
 * is enforced by firestore.rules.
 *
 *   firebase functions:secrets:set RAZORPAY_KEY_SECRET
 *   firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
 *   # RAZORPAY_KEY_ID is a normal param → asked on first deploy (or set in functions/.env)
 *   firebase deploy --only functions
 *
 * Razorpay Dashboard → Webhooks → URL: https://<region>-<project>.cloudfunctions.net/razorpayWebhook
 *   events: payment.captured   secret: RAZORPAY_WEBHOOK_SECRET
 */
const crypto = require('node:crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const REGION = 'asia-south1';
const RAZORPAY_KEY_ID = defineString('RAZORPAY_KEY_ID', { description: 'Razorpay Key ID (rzp_live_… / rzp_test_…)' });
const RAZORPAY_KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET');
const RAZORPAY_WEBHOOK_SECRET = defineSecret('RAZORPAY_WEBHOOK_SECRET');

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

async function appConfig() {
  return (await db.doc('config/app').get()).data() || {};
}

/**
 * Idempotent wallet credit shared by EVERY gateway.
 * depositId must be unique per real payment (e.g. "rzp_<paymentId>") → a payment can never be
 * credited twice even if the client callback AND the webhook both arrive.
 */
async function creditDeposit({ depositId, uid, amount, method, gatewayRef, note }) {
  const depRef = db.doc(`deposits/${depositId}`);
  const walletRef = db.doc(`wallets/${uid}`);
  const user = (await db.doc(`users/${uid}`).get()).data() || {};
  return db.runTransaction(async (tx) => {
    const dep = await tx.get(depRef);
    if (dep.exists && dep.data().status === 'approved') return { alreadyCredited: true, amount };
    const now = FieldValue.serverTimestamp();
    tx.set(depRef, {
      uid, amount, utr: gatewayRef, method, status: 'approved',
      userName: user.name || '', userEmail: user.email || '',
      createdAt: now, processedAt: now, processedBy: `system:${method}`,
    });
    tx.set(walletRef, { deposit: FieldValue.increment(amount), updatedAt: now, lastRef: { type: 'deposit', id: depositId } }, { merge: true });
    tx.set(db.doc(`wallets/${uid}/txns/deposit_${depositId}`), { type: 'deposit', amount, refId: depositId, note, createdAt: now });
    return { credited: true, amount };
  });
}

// ─────────────────────────── RAZORPAY ───────────────────────────

/** Step 1 – create an order for the signed-in player. */
exports.createRazorpayOrder = onCall({ region: REGION, secrets: [RAZORPAY_KEY_SECRET] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please log in.');
  const cfg = await appConfig();
  if (!cfg.features?.razorpay) throw new HttpsError('failed-precondition', 'Razorpay deposits are disabled.');
  const amount = Math.floor(Number(req.data?.amount));
  if (!(amount >= (cfg.minDeposit || 10) && amount <= (cfg.maxDeposit || 10000))) {
    throw new HttpsError('invalid-argument', `Amount must be between ₹${cfg.minDeposit} and ₹${cfg.maxDeposit}.`);
  }
  const basic = Buffer.from(`${RAZORPAY_KEY_ID.value()}:${RAZORPAY_KEY_SECRET.value()}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amount * 100, currency: 'INR', receipt: `w_${Date.now()}`, notes: { uid: req.auth.uid } }),
  });
  const order = await res.json();
  if (!res.ok) {
    logger.error('Razorpay order failed', order);
    throw new HttpsError('internal', order?.error?.description || 'Payment gateway error.');
  }
  await db.doc(`paymentOrders/${order.id}`).set({
    uid: req.auth.uid, amount, gateway: 'razorpay', status: 'created', createdAt: FieldValue.serverTimestamp(),
  });
  return { orderId: order.id, amount: order.amount, keyId: RAZORPAY_KEY_ID.value() };
});

/** Step 2 – Checkout success callback: verify HMAC signature, then credit. */
exports.verifyRazorpayPayment = onCall({ region: REGION, secrets: [RAZORPAY_KEY_SECRET] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please log in.');
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.data || {};
  const expected = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET.value()).update(`${orderId}|${paymentId}`).digest('hex');
  if (!safeEqualHex(expected, signature)) throw new HttpsError('permission-denied', 'Invalid payment signature.');
  const orderRef = db.doc(`paymentOrders/${orderId}`);
  const order = await orderRef.get();
  if (!order.exists || order.data().uid !== req.auth.uid) throw new HttpsError('not-found', 'Order not found.');
  const result = await creditDeposit({
    depositId: `rzp_${paymentId}`, uid: req.auth.uid, amount: order.data().amount,
    method: 'razorpay', gatewayRef: paymentId, note: `Razorpay deposit · ${paymentId}`,
  });
  await orderRef.update({ status: 'paid', paymentId });
  return result;
});

/** Step 3 (backup) – webhook in case the app was closed before the callback. */
exports.razorpayWebhook = onRequest({ region: REGION, secrets: [RAZORPAY_WEBHOOK_SECRET] }, async (req, res) => {
  const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET.value()).update(req.rawBody).digest('hex');
  if (!safeEqualHex(expected, req.get('x-razorpay-signature'))) { res.status(401).send('invalid signature'); return; }
  const { event, payload } = req.body || {};
  if (event === 'payment.captured') {
    const p = payload.payment.entity;
    const orderRef = db.doc(`paymentOrders/${p.order_id}`);
    const order = await orderRef.get();
    if (order.exists && p.amount === order.data().amount * 100 && p.currency === 'INR') {
      await creditDeposit({
        depositId: `rzp_${p.id}`, uid: order.data().uid, amount: order.data().amount,
        method: 'razorpay', gatewayRef: p.id, note: `Razorpay deposit · ${p.id}`,
      });
      await orderRef.update({ status: 'paid', paymentId: p.id });
    } else {
      logger.warn('Webhook for unknown order or amount mismatch', { order: p.order_id, amount: p.amount });
    }
  }
  res.json({ ok: true });
});

// ─────────────────────────── TOURNAPAY / OTHER GATEWAYS (template) ───────────────────────────

/** Return { paymentUrl } for a redirect-style gateway. Fill in your provider's API call. */
exports.createTournaPayOrder = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please log in.');
  const cfg = await appConfig();
  if (!cfg.features?.tournapay) throw new HttpsError('failed-precondition', 'TournaPay is disabled.');
  const amount = Math.floor(Number(req.data?.amount));
  const orderRef = db.collection('paymentOrders').doc();
  await orderRef.set({ uid: req.auth.uid, amount, gateway: 'tournapay', status: 'created', createdAt: FieldValue.serverTimestamp() });
  // TODO: call the TournaPay "create payment" API with orderRef.id as your merchant order id,
  //       amount, callback URL = tournapayWebhook, and return its hosted payment URL.
  throw new HttpsError('unimplemented', `Connect your TournaPay API here (order ${orderRef.id}).`);
});

/** Gateway → server notification. Verify the provider signature, then creditDeposit(). */
exports.tournapayWebhook = onRequest({ region: REGION }, async (req, res) => {
  // TODO: verify signature exactly as documented by your gateway before trusting the body!
  // const { orderId, txnId, status, amount } = req.body;
  // const order = await db.doc(`paymentOrders/${orderId}`).get();
  // if (status === 'SUCCESS' && order.exists && Number(amount) === order.data().amount) {
  //   await creditDeposit({ depositId: `tp_${txnId}`, uid: order.data().uid, amount: order.data().amount,
  //                         method: 'tournapay', gatewayRef: txnId, note: `TournaPay deposit · ${txnId}` });
  // }
  res.status(501).json({ error: 'not configured' });
});
