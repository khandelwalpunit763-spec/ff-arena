// Staff-side match management: create, edit, go-live, room details, cancel & refund.
import {
  collection, doc, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot,
  getDocs, runTransaction, writeBatch, serverTimestamp, Timestamp, increment,
} from 'firebase/firestore';
import { fb } from '../../shared/firebase.js';
import { AppError } from '../../shared/errors.js';
import { STATUS, teamSize } from '../../shared/constants.js';

const withId = (s) => ({ id: s.id, ...s.data() });
const int = (v) => Math.max(0, Math.floor(Number(v) || 0));

export function normaliseMatchForm(form) {
  const rankPrizes = {};
  (form.rankPrizes || []).forEach((p, i) => {
    const v = int(p);
    if (v > 0) rankPrizes[String(i + 1)] = v;
  });
  const start = new Date(form.startAt);
  if (Number.isNaN(start.getTime())) throw new AppError('DATE', 'Choose a valid date & time.');
  const data = {
    title: String(form.title || '').trim().slice(0, 80),
    type: form.type,
    map: form.map,
    startAt: Timestamp.fromDate(start),
    entryFee: int(form.entryFee),
    perKill: int(form.perKill),
    prizePool: int(form.prizePool),
    rankPrizes,
    totalSlots: int(form.totalSlots),
    description: String(form.description || '').trim().slice(0, 1500),
  };
  if (data.title.length < 3) throw new AppError('TITLE', 'Title must be at least 3 characters.');
  if (start.getTime() <= Date.now()) throw new AppError('DATE', 'Start time must be in the future.');
  if (data.totalSlots < 2 || data.totalSlots > 100) throw new AppError('SLOTS', 'Total slots must be between 2 and 100.');
  if (data.totalSlots % teamSize(data.type) !== 0) throw new AppError('SLOTS', `Total slots must be a multiple of ${teamSize(data.type)} for ${data.type}.`);
  return data;
}

/** Creates a match tagged with the host's admin_id (hostId) and staff_name (hostName). */
export async function createMatch(form, staff) {
  const data = normaliseMatchForm(form);
  const ref = doc(collection(fb().db, 'matches'));
  await setDoc(ref, {
    ...data,
    hostId: staff.uid,
    hostName: staff.name,
    status: STATUS.UPCOMING,
    joinedCount: 0, collected: 0,
    rankPaid: 0, killsPaid: 0, distributed: 0, resultsCount: 0,
    refunded: 0, refundedCount: 0,
    roomPublishedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateMatchDetails(matchId, form, { moneyLocked }) {
  const data = normaliseMatchForm(form);
  const patch = { title: data.title, startAt: data.startAt, map: data.map, description: data.description, updatedAt: serverTimestamp() };
  if (!moneyLocked) Object.assign(patch, {
    entryFee: data.entryFee, perKill: data.perKill, prizePool: data.prizePool,
    rankPrizes: data.rankPrizes, totalSlots: data.totalSlots, type: data.type,
  });
  await updateDoc(doc(fb().db, 'matches', matchId), patch);
}

/** Staff → only own matches (hostId filter). Super Admin → all (or filter by a staff id). */
export function listenHostMatches({ hostId = null } = {}, cb, onError) {
  const base = collection(fb().db, 'matches');
  const q = hostId
    ? query(base, where('hostId', '==', hostId), orderBy('startAt', 'desc'), limit(150))
    : query(base, orderBy('startAt', 'desc'), limit(150));
  return onSnapshot(q, (snap) => cb(snap.docs.map(withId)), onError);
}

export async function setMatchStatus(matchId, status) {
  await updateDoc(doc(fb().db, 'matches', matchId), { status, updatedAt: serverTimestamp() });
}

export async function deleteMatch(matchId) {
  await deleteDoc(doc(fb().db, 'matches', matchId));
}

/** Room ID + password (rules allow it only from 15 minutes before start). */
export async function publishRoom(matchId, { roomId, roomPass }, me) {
  const { db } = fb();
  const batch = writeBatch(db);
  batch.set(doc(db, 'matches', matchId, 'private', 'room'), {
    roomId: String(roomId).trim().slice(0, 30),
    roomPass: String(roomPass || '').trim().slice(0, 30),
    updatedAt: serverTimestamp(),
    by: me.uid,
  });
  batch.update(doc(db, 'matches', matchId), { roomPublishedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await batch.commit();
}

/**
 * Cancels a match and refunds every player to the exact balance they paid from.
 * Each refund is its own transaction with a create-only refunds/{uid} doc → safe to re-run.
 */
export async function cancelMatchAndRefund(match, me, onProgress = () => {}) {
  const { db } = fb();
  if (match.status !== STATUS.CANCELLED) await setMatchStatus(match.id, STATUS.CANCELLED);
  const [players, refunds] = await Promise.all([
    getDocs(collection(db, 'matches', match.id, 'players')),
    getDocs(collection(db, 'matches', match.id, 'refunds')),
  ]);
  const done = new Set(refunds.docs.map((d) => d.id));
  const todo = players.docs.filter((d) => !done.has(d.id));
  let i = 0;
  for (const p of todo) {
    await refundOne(match.id, p.id, me);
    i += 1;
    onProgress(i, todo.length);
  }
  return { refunded: todo.length };
}

async function refundOne(matchId, uid, me) {
  const { db } = fb();
  const matchRef = doc(db, 'matches', matchId);
  const playerRef = doc(db, 'matches', matchId, 'players', uid);
  const refundRef = doc(db, 'matches', matchId, 'refunds', uid);
  const walletRef = doc(db, 'wallets', uid);
  const txnRef = doc(db, 'wallets', uid, 'txns', `refund_${matchId}`);
  await runTransaction(db, async (tx) => {
    const [mSnap, rSnap, pSnap] = await Promise.all([tx.get(matchRef), tx.get(refundRef), tx.get(playerRef)]);
    if (rSnap.exists()) return;
    const m = mSnap.data();
    const p = pSnap.data();
    const amount = p.fromDeposit + p.fromWinning;
    const now = serverTimestamp();
    tx.set(refundRef, { uid, amount, by: me.uid, createdAt: now });
    tx.update(matchRef, { refunded: increment(amount), refundedCount: increment(1), lastRefund: uid, updatedAt: now });
    if (amount > 0) {
      const walletPatch = { updatedAt: now, lastRef: { type: 'refund', id: matchId } };
      if (p.fromDeposit) walletPatch.deposit = increment(p.fromDeposit);
      if (p.fromWinning) walletPatch.winning = increment(p.fromWinning);
      tx.update(walletRef, walletPatch);
      tx.set(txnRef, { type: 'refund', amount, refId: matchId, note: `Refund · ${m.title} (cancelled)`.slice(0, 120), createdAt: now });
    }
  });
}
