// Tournament listing + the concurrency-safe JOIN transaction.
import {
  collection, collectionGroup, doc, query, where, orderBy, limit, onSnapshot, getDoc,
  runTransaction, serverTimestamp, documentId, getDocs, increment,
} from 'firebase/firestore';
import { fb, session } from '../shared/firebase.js';
import { AppError } from '../shared/errors.js';
import { splitEntryFee } from '../shared/prize.js';
import { STATUS } from '../shared/constants.js';

const withId = (s) => ({ id: s.id, ...s.data() });

// ─────────────── Listing ───────────────
/** Live / Upcoming / Completed lists (real-time). */
export function listenMatchesByStatus(status, cb, onError, max = 40) {
  const direction = status === STATUS.UPCOMING ? 'asc' : 'desc';
  const q = query(collection(fb().db, 'matches'), where('status', '==', status), orderBy('startAt', direction), limit(max));
  return onSnapshot(q, (snap) => cb(snap.docs.map(withId)), onError);
}

export function listenMatch(matchId, cb, onError) {
  return onSnapshot(doc(fb().db, 'matches', matchId), (s) => cb(s.exists() ? withId(s) : null), onError);
}

export async function getMatch(matchId) {
  const s = await getDoc(doc(fb().db, 'matches', matchId));
  return s.exists() ? withId(s) : null;
}

/** Slot map { [slotNo]: {uid, ign, ...} } – updates instantly when anyone books a slot. */
export function listenSlots(matchId, cb, onError) {
  return onSnapshot(collection(fb().db, 'matches', matchId, 'slots'), (snap) => {
    const map = {};
    snap.docs.forEach((d) => { map[Number(d.id)] = d.data(); });
    cb(map);
  }, onError);
}

export function listenPlayers(matchId, cb, onError) {
  const q = query(collection(fb().db, 'matches', matchId, 'players'), orderBy('slotNo', 'asc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map(withId)), onError);
}

export function listenResults(matchId, cb, onError) {
  const q = query(collection(fb().db, 'matches', matchId, 'results'), orderBy('rank', 'asc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map(withId)), onError);
}

/** Room ID / password – readable only by joined players & staff (enforced by rules). */
export function listenRoom(matchId, cb) {
  return onSnapshot(
    doc(fb().db, 'matches', matchId, 'private', 'room'),
    (s) => cb(s.exists() ? s.data() : null),
    () => cb(null),
  );
}

/** All my joined entries (collection-group query on players). */
export function listenMyEntries(uid, cb, onError) {
  const q = query(collectionGroup(fb().db, 'players'), where('uid', '==', uid), orderBy('joinedAt', 'desc'), limit(100));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ matchId: d.ref.parent.parent.id, ...d.data() })));
  }, onError);
}

export async function getMatchesByIds(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    if (!chunk.length) continue;
    const snap = await getDocs(query(collection(fb().db, 'matches'), where(documentId(), 'in', chunk)));
    snap.docs.forEach((d) => out.push(withId(d)));
  }
  return out;
}

// ─────────────── JOIN (atomic) ───────────────
/**
 * Joins a match atomically. In ONE Firestore transaction we:
 *   1. read match, slot lock, my player entry and my wallet
 *   2. create  matches/{id}/slots/{slotNo}     ← create-only lock (no double booking)
 *   3. create  matches/{id}/players/{uid}      ← one entry per user
 *   4. update  matches/{id}  joinedCount+1, collected+fee
 *   5. update  wallets/{uid} deposit/winning − fee  (+ ledger entry)
 * If two users pick the same slot at the same millisecond, Firestore commits only one;
 * the other transaction is retried, sees the slot taken and fails with SLOT_TAKEN.
 */
export async function joinMatch({ matchId, slotNo, ign, ffUid }, ctx = session()) {
  const { db, uid } = ctx;
  if (!uid) throw new AppError('AUTH', 'Please log in to join.');
  const slot = Number(slotNo);
  const cleanIgn = String(ign || '').trim();
  const cleanFfUid = String(ffUid || '').replace(/\D/g, '');
  if (!Number.isInteger(slot) || slot < 1) throw new AppError('INVALID_SLOT', 'Please select a slot.');
  if (cleanIgn.length < 2 || cleanIgn.length > 24) throw new AppError('INVALID_IGN', 'In-game name must be 2–24 characters.');
  if (!/^\d{5,15}$/.test(cleanFfUid)) throw new AppError('INVALID_FFUID', 'Free Fire Player ID must be 5–15 digits.');

  const matchRef = doc(db, 'matches', matchId);
  const slotRef = doc(db, 'matches', matchId, 'slots', String(slot));
  const playerRef = doc(db, 'matches', matchId, 'players', uid);
  const walletRef = doc(db, 'wallets', uid);
  const txnRef = doc(db, 'wallets', uid, 'txns', `join_${matchId}`);

  try {
    return await runTransaction(db, async (tx) => {
      const [mSnap, sSnap, pSnap, wSnap] = await Promise.all([
        tx.get(matchRef), tx.get(slotRef), tx.get(playerRef), tx.get(walletRef),
      ]);
      if (!mSnap.exists()) throw new AppError('NOT_FOUND', 'Match not found.');
      const m = mSnap.data();
      if (m.status !== STATUS.UPCOMING) throw new AppError('CLOSED', 'Joining is closed for this match.');
      if (m.startAt.toMillis() <= Date.now()) throw new AppError('CLOSED', 'Match already started – joining closed.');
      if (pSnap.exists()) throw new AppError('ALREADY_JOINED', `You already joined this match (slot #${pSnap.data().slotNo}).`);
      if (slot > m.totalSlots) throw new AppError('INVALID_SLOT', 'Invalid slot.');
      if (m.joinedCount >= m.totalSlots) throw new AppError('FULL', 'Match is full.');
      if (sSnap.exists()) throw new AppError('SLOT_TAKEN', `Slot #${slot} was just booked by another player. Please pick another slot.`);

      const fee = Number(m.entryFee || 0);
      let split = { fromDeposit: 0, fromWinning: 0 };
      if (fee > 0) {
        if (!wSnap.exists()) throw new AppError('NO_WALLET', 'Wallet not ready yet. Please reopen the app.');
        split = splitEntryFee(wSnap.data(), fee);
        if (!split) throw new AppError('INSUFFICIENT_BALANCE', `Insufficient balance. Entry fee is ₹${fee}.`);
      }

      // increment() keeps every write valid against the LATEST server state, so a conflict
      // with another joiner surfaces as a retryable precondition failure (auto-retry).
      const now = serverTimestamp();
      tx.set(slotRef, { slotNo: slot, uid, ign: cleanIgn, ffUid: cleanFfUid, joinedAt: now });
      tx.set(playerRef, {
        uid, slotNo: slot, ign: cleanIgn, ffUid: cleanFfUid,
        fromDeposit: split.fromDeposit, fromWinning: split.fromWinning, joinedAt: now,
      });
      tx.update(matchRef, { joinedCount: increment(1), collected: increment(fee) });
      if (fee > 0) {
        // Only touch balances that actually change (increment(-0) would turn an int into a double).
        const walletPatch = { updatedAt: now, lastRef: { type: 'join', id: matchId } };
        if (split.fromDeposit) walletPatch.deposit = increment(-split.fromDeposit);
        if (split.fromWinning) walletPatch.winning = increment(-split.fromWinning);
        tx.update(walletRef, walletPatch);
        tx.set(txnRef, { type: 'join', amount: -fee, refId: matchId, note: `Entry fee · ${m.title}`.slice(0, 120), createdAt: now });
      }
      return { matchId, slotNo: slot, fee, ...split };
    }, { maxAttempts: 12 });
  } catch (err) {
    if (err?.code !== 'permission-denied') throw err;
    // Lost a same-millisecond race: the slot lock (create-only) now exists → explain nicely.
    const [s, p] = await Promise.all([getDoc(slotRef).catch(() => null), getDoc(playerRef).catch(() => null)]);
    if (p?.exists()) throw new AppError('ALREADY_JOINED', `You already joined this match (slot #${p.data().slotNo}).`);
    if (s?.exists()) throw new AppError('SLOT_TAKEN', `Slot #${slot} was just booked by another player. Please pick another slot.`);
    throw err;
  }
}

// ─────────────── View helpers ───────────────
/** Display state for a card: 'live' | 'open' | 'closed' | 'full' | 'completed' | 'cancelled' */
export function matchPhase(m, now = Date.now()) {
  if (m.status === STATUS.COMPLETED) return 'completed';
  if (m.status === STATUS.CANCELLED) return 'cancelled';
  if (m.status === STATUS.LIVE) return 'live';
  if (m.startAt?.toMillis?.() <= now) return 'closed';
  if (m.joinedCount >= m.totalSlots) return 'full';
  return 'open';
}
