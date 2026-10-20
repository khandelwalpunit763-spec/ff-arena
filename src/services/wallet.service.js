// Wallet: Deposit balance (play-only) + Winning balance (withdrawable).
import {
  collection, doc, query, where, orderBy, limit, onSnapshot, runTransaction, serverTimestamp, increment,
} from 'firebase/firestore';
import { fb, session } from '../shared/firebase.js';
import { AppError } from '../shared/errors.js';
import { WITHDRAW_METHODS } from '../shared/constants.js';

const withId = (s) => ({ id: s.id, ...s.data() });

export function listenWallet(uid, cb, onError) {
  return onSnapshot(doc(fb().db, 'wallets', uid), (s) => cb(s.exists() ? s.data() : null), onError);
}

export function listenTxns(uid, cb, onError, max = 50) {
  const q = query(collection(fb().db, 'wallets', uid, 'txns'), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(q, (snap) => cb(snap.docs.map(withId)), onError);
}

export function listenMyWithdrawals(uid, cb, onError) {
  const q = query(collection(fb().db, 'withdrawals'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(30));
  return onSnapshot(q, (snap) => cb(snap.docs.map(withId)), onError);
}

export function listenMyDeposits(uid, cb, onError) {
  const q = query(collection(fb().db, 'deposits'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(30));
  return onSnapshot(q, (snap) => cb(snap.docs.map(withId)), onError);
}

/**
 * Withdrawal request: the amount is HELD (deducted from winning) immediately, atomically with
 * the request document, so the same money can never be requested twice.
 */
export async function requestWithdrawal({ amount, method, account, holder, userName, userEmail }, appConfig, ctx = session()) {
  const { db, uid } = ctx;
  const amt = Math.floor(Number(amount));
  if (!uid) throw new AppError('AUTH', 'Please log in.');
  if (!Number.isInteger(amt) || amt < appConfig.minWithdraw) throw new AppError('MIN', `Minimum withdrawal is ₹${appConfig.minWithdraw}.`);
  if (amt > appConfig.maxWithdraw) throw new AppError('MAX', `Maximum withdrawal is ₹${appConfig.maxWithdraw}.`);
  if (!WITHDRAW_METHODS[method]) throw new AppError('METHOD', 'Choose a payout method.');
  const acc = String(account || '').trim();
  if (method === 'upi' && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(acc)) throw new AppError('ACCOUNT', 'Enter a valid UPI ID (e.g. name@okaxis).');
  if (method !== 'upi' && !/^\d{10}$/.test(acc)) throw new AppError('ACCOUNT', 'Enter a valid 10-digit mobile number.');
  if (String(holder || '').trim().length < 2) throw new AppError('HOLDER', 'Enter the account holder name.');

  const walletRef = doc(db, 'wallets', uid);
  const wRef = doc(collection(db, 'withdrawals'));
  const txnRef = doc(db, 'wallets', uid, 'txns', `withdraw_${wRef.id}`);

  return runTransaction(db, async (tx) => {
    const w = await tx.get(walletRef);
    if (!w.exists()) throw new AppError('NO_WALLET', 'Wallet not found.');
    const wallet = w.data();
    if (wallet.winning < amt) throw new AppError('INSUFFICIENT', `You can withdraw up to ₹${wallet.winning} (winning balance only).`);
    const now = serverTimestamp();
    tx.set(wRef, {
      uid, userName: String(userName || '').slice(0, 60), userEmail, amount: amt, method,
      account: acc, holder: String(holder).trim().slice(0, 60), status: 'pending', createdAt: now,
    });
    tx.update(walletRef, { winning: increment(-amt), updatedAt: now, lastRef: { type: 'withdraw', id: wRef.id } });
    tx.set(txnRef, { type: 'withdraw', amount: -amt, refId: wRef.id, note: `Withdrawal to ${WITHDRAW_METHODS[method].label} · ${acc}`.slice(0, 120), createdAt: now });
    return { id: wRef.id, amount: amt };
  });
}

/** Manual UPI deposit: user paid via UPI intent/QR and submits the 12-digit UTR for verification. */
export async function submitUpiDeposit({ amount, utr, userName, userEmail }, appConfig, ctx = session()) {
  const { db, uid } = ctx;
  const amt = Math.floor(Number(amount));
  const ref = String(utr || '').replace(/\s/g, '').toUpperCase();
  if (!uid) throw new AppError('AUTH', 'Please log in.');
  if (!Number.isInteger(amt) || amt < appConfig.minDeposit) throw new AppError('MIN', `Minimum deposit is ₹${appConfig.minDeposit}.`);
  if (amt > appConfig.maxDeposit) throw new AppError('MAX', `Maximum deposit is ₹${appConfig.maxDeposit}.`);
  if (!/^[0-9A-Z]{10,22}$/.test(ref)) throw new AppError('UTR', 'Enter the 12-digit UTR / UPI reference number from your payment app.');

  const depRef = doc(db, 'deposits', ref);
  return runTransaction(db, async (tx) => {
    let existing;
    try {
      existing = await tx.get(depRef);
    } catch (e) {
      // Somebody else's deposit document → rules deny the read → it is a duplicate UTR.
      if (e.code === 'permission-denied') throw new AppError('DUPLICATE_UTR', 'This UTR has already been submitted.');
      throw e;
    }
    if (existing.exists()) throw new AppError('DUPLICATE_UTR', 'This UTR has already been submitted.');
    tx.set(depRef, {
      uid, userName: String(userName || '').slice(0, 60), userEmail, amount: amt, utr: ref,
      method: 'upi', status: 'pending', createdAt: serverTimestamp(),
    });
    return { id: ref, amount: amt };
  });
}
