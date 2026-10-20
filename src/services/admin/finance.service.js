// Super Admin finance: withdrawals, deposits, wallet adjustments, revenue analytics, users.
import {
  collection, doc, query, where, orderBy, limit, onSnapshot, getDocs, getDoc, updateDoc,
  runTransaction, serverTimestamp, getAggregateFromServer, sum, count, increment,
} from 'firebase/firestore';
import { fb } from '../../shared/firebase.js';
import { AppError } from '../../shared/errors.js';

const withId = (s) => ({ id: s.id, ...s.data() });

// ─────────── Withdrawals ───────────
export function listenWithdrawals(status, cb, onError) {
  const q = query(collection(fb().db, 'withdrawals'), where('status', '==', status), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snap) => cb(snap.docs.map(withId)), onError);
}

export async function markWithdrawalPaid(w, txnRef, me) {
  await updateDoc(doc(fb().db, 'withdrawals', w.id), {
    status: 'paid', txnRef: String(txnRef).trim().slice(0, 60), processedBy: me.uid, processedAt: serverTimestamp(),
  });
}

/** Reject → the held amount returns to the player's winning balance (atomic). */
export async function rejectWithdrawal(w, reason, me) {
  const { db } = fb();
  const wRef = doc(db, 'withdrawals', w.id);
  const walletRef = doc(db, 'wallets', w.uid);
  await runTransaction(db, async (tx) => {
    const ws = await tx.get(wRef);
    if (ws.data().status !== 'pending') throw new AppError('DONE', 'Already processed.');
    const now = serverTimestamp();
    tx.update(wRef, { status: 'rejected', reason: String(reason || 'Rejected').slice(0, 200), processedBy: me.uid, processedAt: now });
    tx.update(walletRef, { winning: increment(w.amount), updatedAt: now, lastRef: { type: 'wd_reject', id: w.id } });
    tx.set(doc(db, 'wallets', w.uid, 'txns', `wd_reject_${w.id}`), {
      type: 'wd_reject', amount: w.amount, refId: w.id, note: `Withdrawal reversed · ${String(reason || '').slice(0, 80)}`, createdAt: now,
    });
  });
}

// ─────────── Deposits (manual UPI / UTR) ───────────
export function listenDeposits(status, cb, onError) {
  const q = query(collection(fb().db, 'deposits'), where('status', '==', status), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snap) => cb(snap.docs.map(withId)), onError);
}

export async function approveDeposit(d, me) {
  const { db } = fb();
  const dRef = doc(db, 'deposits', d.id);
  const walletRef = doc(db, 'wallets', d.uid);
  await runTransaction(db, async (tx) => {
    const ds = await tx.get(dRef);
    if (ds.data().status !== 'pending') throw new AppError('DONE', 'Already processed.');
    const now = serverTimestamp();
    tx.update(dRef, { status: 'approved', processedBy: me.uid, processedAt: now });
    tx.update(walletRef, { deposit: increment(ds.data().amount), updatedAt: now, lastRef: { type: 'deposit', id: d.id } });
    tx.set(doc(db, 'wallets', d.uid, 'txns', `deposit_${d.id}`), {
      type: 'deposit', amount: ds.data().amount, refId: d.id, note: `UPI deposit · UTR ${ds.data().utr}`, createdAt: now,
    });
  });
}

export async function rejectDeposit(d, reason, me) {
  await updateDoc(doc(fb().db, 'deposits', d.id), {
    status: 'rejected', reason: String(reason || 'Payment not received').slice(0, 200), processedBy: me.uid, processedAt: serverTimestamp(),
  });
}

// ─────────── Wallet adjustment (Super Admin) ───────────
export async function adjustWallet(uid, { depositDelta = 0, winningDelta = 0, note = '' }) {
  const { db } = fb();
  const walletRef = doc(db, 'wallets', uid);
  const refId = doc(collection(db, 'x')).id;
  await runTransaction(db, async (tx) => {
    const w = (await tx.get(walletRef)).data();
    const dd = Math.trunc(depositDelta);
    const wd = Math.trunc(winningDelta);
    if (w.deposit + dd < 0 || w.winning + wd < 0) throw new AppError('NEGATIVE', 'Balance cannot go below ₹0.');
    const now = serverTimestamp();
    const walletPatch = { updatedAt: now, lastRef: { type: 'adjust', id: refId } };
    if (dd) walletPatch.deposit = increment(dd);
    if (wd) walletPatch.winning = increment(wd);
    tx.update(walletRef, walletPatch);
    tx.set(doc(db, 'wallets', uid, 'txns', `adjust_${refId}`), {
      type: 'adjust', amount: Math.trunc(depositDelta) + Math.trunc(winningDelta), refId, note: String(note || 'Admin adjustment').slice(0, 120), createdAt: now,
    });
  });
}

// ─────────── Users ───────────
export async function listUsers(max = 300) {
  const snap = await getDocs(query(collection(fb().db, 'users'), orderBy('createdAt', 'desc'), limit(max)));
  return snap.docs.map(withId);
}

export async function getWallet(uid) {
  const s = await getDoc(doc(fb().db, 'wallets', uid));
  return s.exists() ? s.data() : { deposit: 0, winning: 0 };
}

export async function setUserBanned(uid, banned) {
  await updateDoc(doc(fb().db, 'users', uid), { banned: Boolean(banned), updatedAt: serverTimestamp() });
}

// ─────────── Revenue analytics ───────────
// fields: { key: 'count' | 'sum:<field>' }  → server-side aggregation (no document reads billed
// per match). Falls back to client-side summing if aggregation is unavailable.
async function aggregate(q, fields) {
  const spec = {};
  Object.entries(fields).forEach(([k, f]) => { spec[k] = f === 'count' ? count() : sum(f.slice(4)); });
  try {
    const snap = await getAggregateFromServer(q, spec);
    const data = snap.data();
    Object.keys(data).forEach((k) => { data[k] = Number(data[k] || 0); });
    return data;
  } catch (e) {
    console.warn('Aggregation fallback:', e.message);
    const docs = (await getDocs(q)).docs.map((d) => d.data());
    const out = {};
    Object.entries(fields).forEach(([k, f]) => {
      out[k] = f === 'count' ? docs.length : docs.reduce((a, d) => a + Number(d[f.slice(4)] || 0), 0);
    });
    return out;
  }
}

/** Platform revenue = entry fees collected − prizes distributed − refunds. */
export async function fetchRevenueStats(staffList = []) {
  const { db } = fb();
  const matches = collection(db, 'matches');
  const matchSpec = { matches: 'count', collected: 'sum:collected', distributed: 'sum:distributed', refunded: 'sum:refunded' };
  const money = { n: 'count', amount: 'sum:amount' };
  const [all, deposits, paid, pending] = await Promise.all([
    aggregate(matches, matchSpec),
    aggregate(query(collection(db, 'deposits'), where('status', '==', 'approved')), money),
    aggregate(query(collection(db, 'withdrawals'), where('status', '==', 'paid')), money),
    aggregate(query(collection(db, 'withdrawals'), where('status', '==', 'pending')), money),
  ]);
  const perStaff = await Promise.all(staffList.map(async (s) => {
    const r = await aggregate(query(matches, where('hostId', '==', s.uid)), matchSpec);
    return { ...s, ...r, profit: (r.collected || 0) - (r.distributed || 0) - (r.refunded || 0) };
  }));
  return {
    ...all,
    revenue: (all.collected || 0) - (all.distributed || 0) - (all.refunded || 0),
    depositsApproved: deposits,
    withdrawalsPaid: paid,
    withdrawalsPending: pending,
    perStaff,
  };
}
