// ─────────────────────────────────────────────────────────────────────────────
//  THE PRIZE FORMULA  (mirrored 1:1 in firestore.rules → validResult())
//
//    killAmount = kills × perKill
//    rankAmount = rankPrizes[rank]            (per player – in Duo/Squad every member
//                                              of the team at that rank receives it)
//    amount     = killAmount + rankAmount     → credited to the WINNING balance
//
//  Server-side hard caps (rules): Σ rankAmount ≤ prizePool, Σ kills ≤ joined players.
// ─────────────────────────────────────────────────────────────────────────────

import { teamSize } from './constants.js';

const toInt = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function calcWinnings(match, { kills, rank }) {
  const k = toInt(kills);
  const r = toInt(rank);
  const killAmount = k * toInt(match.perKill);
  const rankAmount = r > 0 ? toInt((match.rankPrizes || {})[String(r)]) : 0;
  return { kills: k, rank: r, killAmount, rankAmount, amount: killAmount + rankAmount };
}

/** Total rank money needed if every prize position is filled (per-player prizes × team size). */
export function rankPoolNeeded(rankPrizes, type) {
  const sum = Object.values(rankPrizes || {}).reduce((a, v) => a + toInt(v), 0);
  return sum * teamSize(type);
}

/** Sorted [[rank, prize]] list for display. */
export function rankPrizeList(rankPrizes) {
  return Object.entries(rankPrizes || {})
    .map(([r, p]) => [Number(r), toInt(p)])
    .filter(([r, p]) => r > 0 && p > 0)
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Validate a result sheet BEFORE publishing (the rules enforce the same caps server-side).
 * rows: [{ uid, kills, rank }]
 */
export function validateResultSheet(match, rows) {
  const errors = [];
  const size = teamSize(match.type);
  const perRank = new Map();
  let totalKills = 0;
  let rankPaid = Number(match.rankPaid || 0);

  rows.forEach((row) => {
    const { kills, rank, rankAmount } = calcWinnings(match, row);
    if (!rank) errors.push(`${row.ign || row.uid}: rank is required`);
    if (rank > match.totalSlots) errors.push(`${row.ign}: rank ${rank} is larger than total slots`);
    totalKills += kills;
    rankPaid += rankAmount;
    perRank.set(rank, (perRank.get(rank) || 0) + 1);
  });

  perRank.forEach((count, rank) => {
    if (rank && count > size) errors.push(`Rank #${rank} assigned to ${count} players (max ${size} for ${match.type})`);
  });
  const killsSoFar = Number(match.killsPaid || 0) + totalKills;
  if (killsSoFar > Number(match.joinedCount || 0)) {
    errors.push(`Total kills (${killsSoFar}) cannot exceed joined players (${match.joinedCount})`);
  }
  if (rankPaid > Number(match.prizePool || 0)) {
    errors.push(`Rank prizes (₹${rankPaid}) exceed the prize pool (₹${match.prizePool})`);
  }
  return errors;
}

/** Entry-fee split: Deposit balance is used first, then Winning balance. */
export function splitEntryFee(wallet, fee) {
  const deposit = toInt(wallet?.deposit);
  const winning = toInt(wallet?.winning);
  const f = toInt(fee);
  if (deposit + winning < f) return null;
  const fromDeposit = Math.min(deposit, f);
  return { fromDeposit, fromWinning: f - fromDeposit };
}
