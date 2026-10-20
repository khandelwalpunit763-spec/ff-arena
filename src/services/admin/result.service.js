// Result upload + automatic prize distribution (formula in shared/prize.js, enforced by rules).
import { doc, collection, getDocs, runTransaction, serverTimestamp, increment } from 'firebase/firestore';
import { fb } from '../../shared/firebase.js';
import { calcWinnings, validateResultSheet } from '../../shared/prize.js';
import { STATUS } from '../../shared/constants.js';
import { AppError } from '../../shared/errors.js';
import { setMatchStatus } from './admin-match.service.js';

/**
 * rows: [{ uid, ign, slotNo, kills, rank }]  – one row per joined player.
 * Each player is credited in its own transaction:
 *   results/{uid} (create-only)  +  match counters  +  wallet.winning += amount  +  ledger entry
 * Re-running after a network failure only processes players that were not credited yet.
 */
export async function publishResults(match, rows, me, onProgress = () => {}) {
  const { db } = fb();
  const existing = await getDocs(collection(db, 'matches', match.id, 'results'));
  const done = new Set(existing.docs.map((d) => d.id));
  const pending = rows.filter((r) => !done.has(r.uid));

  const errors = validateResultSheet(match, pending);
  if (errors.length) throw new AppError('INVALID_RESULTS', errors.join('\n'));

  if (match.status === STATUS.UPCOMING) await setMatchStatus(match.id, STATUS.LIVE);
  if (match.status === STATUS.COMPLETED || match.status === STATUS.CANCELLED) {
    throw new AppError('CLOSED', 'Results can only be published for live matches.');
  }

  let credited = 0;
  let total = 0;
  for (let i = 0; i < pending.length; i += 1) {
    const amount = await creditOne(match.id, pending[i], me);
    if (amount > 0) credited += 1;
    total += amount;
    onProgress(i + 1, pending.length);
  }
  await setMatchStatus(match.id, STATUS.COMPLETED);
  return { processed: pending.length, credited, total };
}

async function creditOne(matchId, row, me) {
  const { db } = fb();
  const matchRef = doc(db, 'matches', matchId);
  const resultRef = doc(db, 'matches', matchId, 'results', row.uid);
  const walletRef = doc(db, 'wallets', row.uid);
  const txnRef = doc(db, 'wallets', row.uid, 'txns', `win_${matchId}`);

  return runTransaction(db, async (tx) => {
    const [mSnap, rSnap] = await Promise.all([tx.get(matchRef), tx.get(resultRef)]);
    if (rSnap.exists()) return 0;
    const m = mSnap.data();
    const calc = calcWinnings(m, row);
    const now = serverTimestamp();

    tx.set(resultRef, {
      uid: row.uid, ign: row.ign, slotNo: row.slotNo,
      kills: calc.kills, rank: calc.rank,
      killAmount: calc.killAmount, rankAmount: calc.rankAmount, amount: calc.amount,
      by: me.uid, createdAt: now,
    });
    tx.update(matchRef, {
      rankPaid: increment(calc.rankAmount),
      killsPaid: increment(calc.kills),
      distributed: increment(calc.amount),
      resultsCount: increment(1),
      lastResult: row.uid,
      updatedAt: now,
    });
    if (calc.amount > 0) {
      tx.update(walletRef, { winning: increment(calc.amount), updatedAt: now, lastRef: { type: 'win', id: matchId } });
      tx.set(txnRef, {
        type: 'win', amount: calc.amount, refId: matchId,
        note: `Won · #${calc.rank} · ${calc.kills} kills · ${m.title}`.slice(0, 120), createdAt: now,
      });
    }
    return calc.amount;
  });
}
