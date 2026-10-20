// Payment-gateway hooks. Add new gateways to GATEWAYS + implement start() – the wallet is
// ALWAYS credited server-side (Cloud Function / webhook) or by an admin, never by the client.
import { getFunctions, httpsCallable } from 'firebase/functions';
import { fb } from '../shared/firebase.js';
import { CONFIG } from '../shared/config.js';
import { AppError } from '../shared/errors.js';

export const GATEWAYS = [
  {
    id: 'upi',
    label: 'UPI App',
    sub: 'GPay · PhonePe · Paytm · BHIM — submit UTR, verified by admin',
    enabled: (c) => c.features.upiManual && Boolean(c.upiId),
  },
  {
    id: 'razorpay',
    label: 'Razorpay',
    sub: 'UPI · Cards · Netbanking — instant auto-credit',
    enabled: (c) => c.features.razorpay,
  },
  {
    id: 'tournapay',
    label: 'TournaPay',
    sub: 'Instant auto-credit gateway',
    enabled: (c) => c.features.tournapay,
  },
];

/** Standard UPI deep link (NPCI spec) – opens any UPI app on Android/iOS. */
export function upiIntentUrl({ pa, pn, am, tn, tr }) {
  const parts = [
    ['pa', pa], ['pn', pn], ['am', Number(am).toFixed(2)], ['cu', 'INR'], ['tn', tn], ['tr', tr],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  return `upi://pay?${parts.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

/** Opens the UPI intent. Inside Cordova it uses the system browser so Android shows the app chooser. */
export function openUpiApp(url) {
  if (window.cordova && window.cordova.InAppBrowser) window.cordova.InAppBrowser.open(url, '_system');
  else window.location.href = url;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new AppError('GATEWAY', 'Could not load the payment gateway. Check your internet.'));
    document.head.appendChild(s);
  });
}

const functions = () => getFunctions(fb().app, CONFIG.functionsRegion);

/**
 * Razorpay Checkout hook.
 * Server side (functions/index.js): createRazorpayOrder → verifyRazorpayPayment (HMAC check)
 * → credits wallets/{uid}.deposit idempotently. A webhook (payment.captured) is the backup.
 */
export async function payWithRazorpay({ amount, email, name, phone, brandName }) {
  const { data: order } = await httpsCallable(functions(), 'createRazorpayOrder')({ amount });
  await loadScript('https://checkout.razorpay.com/v1/checkout.js');
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: 'INR',
      name: brandName,
      description: 'Wallet deposit',
      prefill: { name, email, contact: phone },
      theme: { color: '#ff7a18' },
      handler: async (response) => {
        try {
          const { data } = await httpsCallable(functions(), 'verifyRazorpayPayment')(response);
          resolve(data);
        } catch (e) { reject(e); }
      },
      modal: { ondismiss: () => reject(new AppError('CANCELLED', 'Payment cancelled.')) },
    });
    rzp.open();
  });
}

/**
 * TournaPay / any redirect-style gateway hook.
 * Implement `createTournaPayOrder` in functions/index.js to return { paymentUrl }.
 * The gateway's webhook must call creditDeposit() on the server.
 */
export async function payWithTournaPay({ amount }) {
  const { data } = await httpsCallable(functions(), 'createTournaPayOrder')({ amount });
  if (!data?.paymentUrl) throw new AppError('GATEWAY', 'Gateway did not return a payment link.');
  window.location.href = data.paymentUrl;
}
