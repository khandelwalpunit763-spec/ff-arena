// Security-rules + concurrency test-suite (runs against the Firestore emulator).
//   npm test                      → starts emulators, runs this file, stops emulators
//   node --test tests/            → if emulators are already running
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, writeBatch, Timestamp, serverTimestamp, collection, getDocs,
} from 'firebase/firestore';
import { setFirebaseContext } from '../src/shared/firebase.js';
import { joinMatch } from '../src/services/match.service.js';
import { requestWithdrawal, submitUpiDeposit } from '../src/services/wallet.service.js';
import { publishResults } from '../src/services/admin/result.service.js';
import { publishRoom, cancelMatchAndRefund } from '../src/services/admin/admin-match.service.js';
import { approveDeposit, rejectWithdrawal } from '../src/services/admin/finance.service.js';
import { DEFAULT_APP_CONFIG } from '../src/shared/constants.js';

const PROJECT = 'demo-fftest';
let env;
const MIN = 60 * 1000;

const asUser = (uid, email = `${uid}@test.gg`) => env.authenticatedContext(uid, { email }).firestore();
const ctxOf = (uid) => ({ db: asUser(uid), uid });
const useCtx = (uid) => setFirebaseContext({ db: asUser(uid), auth: { currentUser: { uid } } });

async function seed(fn) {
  await env.withSecurityRulesDisabled(async (c) => fn(c.firestore()));
}

function matchDoc(overrides = {}) {
  return {
    title: 'Test Cup', type: 'solo', map: 'Bermuda', startAt: Timestamp.fromMillis(Date.now() + 2 * 60 * MIN),
    entryFee: 20, perKill: 5, prizePool: 300, rankPrizes: { 1: 150, 2: 100, 3: 50 }, totalSlots: 48, description: '',
    hostId: 'staff-a', hostName: 'Staff A', status: 'upcoming', joinedCount: 0, collected: 0, rankPaid: 0,
    killsPaid: 0, distributed: 0, resultsCount: 0, refunded: 0, refundedCount: 0, roomPublishedAt: null,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(), ...overrides,
  };
}

async function addPlayer(db, uid, { deposit = 100, winning = 0 } = {}) {
  await setDoc(doc(db, 'users', uid), { uid, name: uid, email: `${uid}@test.gg`, phone: '', ign: '', ffUid: '', phoneVerified: false, banned: false, createdAt: Timestamp.now() });
  await setDoc(doc(db, 'wallets', uid), { deposit, winning, updatedAt: Timestamp.now(), lastRef: { type: 'init', id: uid } });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'config/app'), { ...DEFAULT_APP_CONFIG, upiId: 'test@upi' });
    await setDoc(doc(db, 'staff/super-1'), { uid: 'super-1', name: 'Owner', email: 'o@test.gg', role: 'super', active: true, perms: { deposits: true }, createdAt: Timestamp.now(), createdBy: 'super-1' });
    await setDoc(doc(db, 'staff/staff-a'), { uid: 'staff-a', name: 'Staff A', email: 'a@test.gg', role: 'staff', active: true, perms: { deposits: false }, createdAt: Timestamp.now(), createdBy: 'super-1' });
    await setDoc(doc(db, 'staff/staff-b'), { uid: 'staff-b', name: 'Staff B', email: 'b@test.gg', role: 'staff', active: true, perms: { deposits: false }, createdAt: Timestamp.now(), createdBy: 'super-1' });
    await setDoc(doc(db, 'matches/m1'), matchDoc());
    await addPlayer(db, 'alice', { deposit: 100, winning: 50 });
    await addPlayer(db, 'bob', { deposit: 5, winning: 0 });
  });
});

// ═══════════════════════ WALLET SAFETY ═══════════════════════
describe('Wallet safety', () => {
  test('player cannot add money to their own wallet', async () => {
    const db = asUser('alice');
    await assertFails(updateDoc(doc(db, 'wallets/alice'), { deposit: 100000, winning: 50, updatedAt: serverTimestamp(), lastRef: { type: 'adjust', id: 'x' } }));
    await assertFails(updateDoc(doc(db, 'wallets/alice'), { deposit: 100000, winning: 50, updatedAt: serverTimestamp(), lastRef: { type: 'join', id: 'm1' } }));
    await assertFails(updateDoc(doc(db, 'wallets/alice'), { deposit: 100, winning: 5000, updatedAt: serverTimestamp(), lastRef: { type: 'win', id: 'm1' } }));
  });

  test('new wallet must start at ₹0', async () => {
    const db = asUser('carol');
    await assertFails(setDoc(doc(db, 'wallets/carol'), { deposit: 500, winning: 0, updatedAt: serverTimestamp(), lastRef: { type: 'init', id: 'carol' } }));
    await assertSucceeds(setDoc(doc(db, 'wallets/carol'), { deposit: 0, winning: 0, updatedAt: serverTimestamp(), lastRef: { type: 'init', id: 'carol' } }));
  });

  test("player cannot read someone else's wallet", async () => {
    await assertFails(getDoc(doc(asUser('bob'), 'wallets/alice')));
    await assertSucceeds(getDoc(doc(asUser('staff-a'), 'wallets/alice')));
  });
});

// ═══════════════════════ JOINING ═══════════════════════
describe('Match joining', () => {
  test('join deducts the exact entry fee, books the slot and updates counters', async () => {
    const res = await joinMatch({ matchId: 'm1', slotNo: 7, ign: 'AliceFF', ffUid: '123456789' }, ctxOf('alice'));
    assert.equal(res.fee, 20);
    await seed(async (db) => {
      const w = (await getDoc(doc(db, 'wallets/alice'))).data();
      assert.deepEqual([w.deposit, w.winning], [80, 50]);
      const m = (await getDoc(doc(db, 'matches/m1'))).data();
      assert.deepEqual([m.joinedCount, m.collected], [1, 20]);
      assert.equal((await getDoc(doc(db, 'matches/m1/slots/7'))).data().uid, 'alice');
      assert.equal((await getDoc(doc(db, 'wallets/alice/txns/join_m1'))).data().amount, -20);
    });
  });

  test('deposit is used first, then winning balance', async () => {
    await seed((db) => setDoc(doc(db, 'wallets/alice'), { deposit: 15, winning: 50, updatedAt: Timestamp.now(), lastRef: { type: 'init', id: 'alice' } }));
    const res = await joinMatch({ matchId: 'm1', slotNo: 1, ign: 'AliceFF', ffUid: '123456789' }, ctxOf('alice'));
    assert.deepEqual([res.fromDeposit, res.fromWinning], [15, 5]);
  });

  test('insufficient balance is rejected (client + rules)', async () => {
    await assert.rejects(joinMatch({ matchId: 'm1', slotNo: 2, ign: 'BobFF', ffUid: '223456789' }, ctxOf('bob')), /Insufficient/);
    // Bypass the client check: forge a batch that claims bob paid with money he does not have
    const db = asUser('bob');
    const b = writeBatch(db);
    b.set(doc(db, 'matches/m1/slots/2'), { slotNo: 2, uid: 'bob', ign: 'BobFF', ffUid: '223456789', joinedAt: serverTimestamp() });
    b.set(doc(db, 'matches/m1/players/bob'), { uid: 'bob', slotNo: 2, ign: 'BobFF', ffUid: '223456789', fromDeposit: 20, fromWinning: 0, joinedAt: serverTimestamp() });
    b.update(doc(db, 'matches/m1'), { joinedCount: 1, collected: 20 });
    b.update(doc(db, 'wallets/bob'), { deposit: -15, winning: 0, updatedAt: serverTimestamp(), lastRef: { type: 'join', id: 'm1' } });
    await assertFails(b.commit());
  });

  test('forged cheaper entry fee is rejected by rules', async () => {
    const db = asUser('alice');
    const b = writeBatch(db);
    b.set(doc(db, 'matches/m1/slots/3'), { slotNo: 3, uid: 'alice', ign: 'AliceFF', ffUid: '123456789', joinedAt: serverTimestamp() });
    b.set(doc(db, 'matches/m1/players/alice'), { uid: 'alice', slotNo: 3, ign: 'AliceFF', ffUid: '123456789', fromDeposit: 1, fromWinning: 0, joinedAt: serverTimestamp() });
    b.update(doc(db, 'matches/m1'), { joinedCount: 1, collected: 1 });
    b.update(doc(db, 'wallets/alice'), { deposit: 99, winning: 50, updatedAt: serverTimestamp(), lastRef: { type: 'join', id: 'm1' } });
    await assertFails(b.commit());
  });

  test('a player cannot join the same match twice', async () => {
    await joinMatch({ matchId: 'm1', slotNo: 4, ign: 'AliceFF', ffUid: '123456789' }, ctxOf('alice'));
    await assert.rejects(joinMatch({ matchId: 'm1', slotNo: 5, ign: 'AliceFF', ffUid: '123456789' }, ctxOf('alice')), /already joined/);
  });

  test('joining is closed after the start time', async () => {
    await seed((db) => setDoc(doc(db, 'matches/m2'), matchDoc({ startAt: Timestamp.fromMillis(Date.now() - MIN) })));
    await assert.rejects(joinMatch({ matchId: 'm2', slotNo: 1, ign: 'AliceFF', ffUid: '123456789' }, ctxOf('alice')), /closed/);
  });
});

// ═══════════════════════ CONCURRENCY ═══════════════════════
describe('Concurrency (no double booking)', () => {
  test('10 players click the SAME slot at the same moment → exactly one wins', async () => {
    const uids = Array.from({ length: 10 }, (_, i) => `racer${i}`);
    await seed(async (db) => { for (const u of uids) await addPlayer(db, u, { deposit: 100 }); });
    const results = await Promise.allSettled(uids.map((u) => joinMatch({ matchId: 'm1', slotNo: 13, ign: `R_${u}`, ffUid: '555555555' }, ctxOf(u))));
    const winners = results.filter((r) => r.status === 'fulfilled');
    const losers = results.filter((r) => r.status === 'rejected');
    assert.equal(winners.length, 1, 'exactly one booking');
    losers.forEach((r) => assert.match(r.reason.code || '', /SLOT_TAKEN|aborted/));
    await seed(async (db) => {
      const m = (await getDoc(doc(db, 'matches/m1'))).data();
      assert.equal(m.joinedCount, 1);
      assert.equal(m.collected, 20);
      const players = await getDocs(collection(db, 'matches/m1/players'));
      assert.equal(players.size, 1);
      // only the winner was charged
      let charged = 0;
      for (const u of uids) if ((await getDoc(doc(db, `wallets/${u}`))).data().deposit === 80) charged += 1;
      assert.equal(charged, 1);
    });
  });

  test('15 players join DIFFERENT slots simultaneously → all succeed, counters exact', async () => {
    const uids = Array.from({ length: 15 }, (_, i) => `p${i}`);
    await seed(async (db) => { for (const u of uids) await addPlayer(db, u, { deposit: 100 }); });
    const results = await Promise.allSettled(uids.map((u, i) => joinMatch({ matchId: 'm1', slotNo: i + 1, ign: `P_${u}`, ffUid: '666666666' }, ctxOf(u))));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    await seed(async (db) => {
      const m = (await getDoc(doc(db, 'matches/m1'))).data();
      assert.equal(m.joinedCount, ok, 'joinedCount equals successful joins');
      assert.equal(m.collected, ok * 20);
      assert.equal((await getDocs(collection(db, 'matches/m1/slots'))).size, ok);
    });
    assert.ok(ok >= 13, `expected nearly all joins to succeed under contention, got ${ok}/15`);
  });
});

// ═══════════════════════ ROOM DETAILS ═══════════════════════
describe('Room ID / password', () => {
  test('only joined players (and staff) can read room details', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'matches/m1/private/room'), { roomId: '12345', roomPass: 'x', updatedAt: Timestamp.now(), by: 'staff-a' });
    });
    await assertFails(getDoc(doc(asUser('bob'), 'matches/m1/private/room')));
    await joinMatch({ matchId: 'm1', slotNo: 9, ign: 'AliceFF', ffUid: '123456789' }, ctxOf('alice'));
    await assertSucceeds(getDoc(doc(asUser('alice'), 'matches/m1/private/room')));
    await assertSucceeds(getDoc(doc(asUser('staff-b'), 'matches/m1/private/room')));
  });

  test('room can be published only from 15 minutes before start, only by the host', async () => {
    useCtx('staff-a');
    await assert.rejects(publishRoom('m1', { roomId: '998877', roomPass: 'p' }, { uid: 'staff-a' }));       // starts in 2h
    await seed((db) => setDoc(doc(db, 'matches/m3'), matchDoc({ startAt: Timestamp.fromMillis(Date.now() + 10 * MIN) })));
    await publishRoom('m3', { roomId: '998877', roomPass: 'p' }, { uid: 'staff-a' });                       // starts in 10 min
    useCtx('staff-b');
    await assert.rejects(publishRoom('m3', { roomId: '111111', roomPass: 'p' }, { uid: 'staff-b' }));       // not the host
  });
});

// ═══════════════════════ MULTI-ADMIN ═══════════════════════
describe('Multi-admin isolation', () => {
  test('staff must tag matches with their own admin_id / staff_name', async () => {
    const db = asUser('staff-a');
    const base = { ...matchDoc(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db, 'matches/new1'), { ...base, hostId: 'staff-a', hostName: 'Staff A' }));
    await assertFails(setDoc(doc(db, 'matches/new2'), { ...base, hostId: 'staff-b', hostName: 'Staff B' }));
    await assertFails(setDoc(doc(db, 'matches/new3'), { ...base, hostId: 'staff-a', hostName: 'Fake Name' }));
    await assertFails(setDoc(doc(asUser('alice'), 'matches/new4'), { ...base, hostId: 'alice', hostName: 'alice' }));
  });

  test("staff cannot modify another staff member's match", async () => {
    await assertFails(updateDoc(doc(asUser('staff-b'), 'matches/m1'), { title: 'Hijacked', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(asUser('staff-a'), 'matches/m1'), { title: 'Renamed Cup', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(asUser('super-1'), 'matches/m1'), { title: 'Super edit', updatedAt: serverTimestamp() }));
  });

  test('staff cannot touch Super Admin configuration or staff roles', async () => {
    const db = asUser('staff-a');
    await assertFails(updateDoc(doc(db, 'config/app'), { minWithdraw: 1 }));
    await assertFails(updateDoc(doc(db, 'staff/staff-a'), { role: 'super' }));
    await assertFails(setDoc(doc(db, 'staff/alice'), { uid: 'alice', name: 'Alice', email: 'a', role: 'staff', active: true, perms: {}, createdAt: serverTimestamp(), createdBy: 'staff-a' }));
    await assertSucceeds(updateDoc(doc(asUser('super-1'), 'config/app'), { minWithdraw: 100 }));
  });

  test('a deactivated staff member loses all privileges', async () => {
    await seed((db) => updateDoc(doc(db, 'staff/staff-a'), { active: false }));
    await assertFails(updateDoc(doc(asUser('staff-a'), 'matches/m1'), { title: 'Nope', updatedAt: serverTimestamp() }));
  });
});

// ═══════════════════════ RESULTS & PRIZES ═══════════════════════
describe('Result upload & prize distribution', () => {
  async function liveMatchWithPlayers() {
    await seed(async (db) => {
      await addPlayer(db, 'carol', { deposit: 100 });
    });
    for (const [u, s] of [['alice', 1], ['bob', 2], ['carol', 3]]) {
      if (u === 'bob') await seed((db) => updateDoc(doc(db, 'wallets/bob'), { deposit: 100 }));
      await joinMatch({ matchId: 'm1', slotNo: s, ign: `${u}FF`, ffUid: '123456789' }, ctxOf(u));
    }
    await seed((db) => updateDoc(doc(db, 'matches/m1'), { status: 'live' }));
    return (await getDoc(doc(asUser('staff-a'), 'matches/m1'))).data();
  }

  test('host distributes winnings with the formula: kills × perKill + rankPrize', async () => {
    const m = await liveMatchWithPlayers();
    useCtx('staff-a');
    const rows = [
      { uid: 'alice', ign: 'aliceFF', slotNo: 1, kills: 2, rank: 1 },   // 2×5 + 150 = 160
      { uid: 'bob', ign: 'bobFF', slotNo: 2, kills: 0, rank: 2 },       // 100
      { uid: 'carol', ign: 'carolFF', slotNo: 3, kills: 1, rank: 3 },   // 5 + 50 = 55
    ];
    const r = await publishResults({ id: 'm1', ...m }, rows, { uid: 'staff-a' });
    assert.equal(r.total, 315);
    await seed(async (db) => {
      assert.equal((await getDoc(doc(db, 'wallets/alice'))).data().winning, 50 + 160);
      assert.equal((await getDoc(doc(db, 'wallets/carol'))).data().winning, 55);
      const mm = (await getDoc(doc(db, 'matches/m1'))).data();
      assert.deepEqual([mm.status, mm.distributed, mm.rankPaid, mm.killsPaid], ['completed', 315, 300, 3]);
    });
  });

  test('wrong amount, double credit, non-host and non-participant are all rejected', async () => {
    await liveMatchWithPlayers();
    const db = asUser('staff-a');
    const credit = (database, uid, { kills, rank, amount, killAmount, rankAmount }, walletAfter, matchAfter) => {
      const b = writeBatch(database);
      b.set(doc(database, `matches/m1/results/${uid}`), { uid, ign: `${uid}FF`, slotNo: { alice: 1, bob: 2, carol: 3 }[uid] || 9, kills, rank, killAmount, rankAmount, amount, by: database === db ? 'staff-a' : 'staff-b', createdAt: serverTimestamp() });
      b.update(doc(database, 'matches/m1'), { ...matchAfter, lastResult: uid, updatedAt: serverTimestamp() });
      b.update(doc(database, `wallets/${uid}`), { ...walletAfter, updatedAt: serverTimestamp(), lastRef: { type: 'win', id: 'm1' } });
      return b.commit();
    };
    const counters = (rank, kills, amount) => ({ rankPaid: rank, killsPaid: kills, distributed: amount, resultsCount: 1 });
    // inflated amount (₹5000 instead of ₹160)
    await assertFails(credit(db, 'alice', { kills: 2, rank: 1, killAmount: 10, rankAmount: 4990, amount: 5000 }, { deposit: 80, winning: 5050 }, counters(4990, 2, 5000)));
    // non-host staff
    await assertFails(credit(asUser('staff-b'), 'alice', { kills: 2, rank: 1, killAmount: 10, rankAmount: 150, amount: 160 }, { deposit: 80, winning: 210 }, counters(150, 2, 160)));
    // correct one works
    await assertSucceeds(credit(db, 'alice', { kills: 2, rank: 1, killAmount: 10, rankAmount: 150, amount: 160 }, { deposit: 80, winning: 210 }, counters(150, 2, 160)));
    // double credit
    await assertFails(credit(db, 'alice', { kills: 2, rank: 1, killAmount: 10, rankAmount: 150, amount: 160 }, { deposit: 80, winning: 370 }, { rankPaid: 300, killsPaid: 4, distributed: 320, resultsCount: 2 }));
    // non-participant
    await seed((db2) => addPlayer(db2, 'mallory', { deposit: 0 }));
    await assertFails(credit(db, 'mallory', { kills: 0, rank: 2, killAmount: 0, rankAmount: 100, amount: 100 }, { deposit: 0, winning: 100 }, { rankPaid: 250, killsPaid: 2, distributed: 260, resultsCount: 2 }));
  });

  test('prize-pool hard cap: rank payouts can never exceed the prize pool', async () => {
    const m = await liveMatchWithPlayers();
    useCtx('staff-a');
    const rows = [
      { uid: 'alice', ign: 'aliceFF', slotNo: 1, kills: 0, rank: 1 },
      { uid: 'bob', ign: 'bobFF', slotNo: 2, kills: 0, rank: 1 },        // second "rank 1" in SOLO
    ];
    await assert.rejects(publishResults({ id: 'm1', ...m }, rows, { uid: 'staff-a' }), /Rank #1 assigned to 2 players/);
  });

  test('cancel & refund returns every rupee to the balance it came from (idempotent)', async () => {
    await seed((db) => setDoc(doc(db, 'wallets/alice'), { deposit: 15, winning: 50, updatedAt: Timestamp.now(), lastRef: { type: 'init', id: 'alice' } }));
    await joinMatch({ matchId: 'm1', slotNo: 1, ign: 'AliceFF', ffUid: '123456789' }, ctxOf('alice'));   // 15 deposit + 5 winning
    useCtx('staff-a');
    const m = (await getDoc(doc(asUser('staff-a'), 'matches/m1'))).data();
    await cancelMatchAndRefund({ id: 'm1', ...m }, { uid: 'staff-a' });
    await cancelMatchAndRefund({ id: 'm1', ...m, status: 'cancelled' }, { uid: 'staff-a' });          // re-run = no double refund
    await seed(async (db) => {
      const w = (await getDoc(doc(db, 'wallets/alice'))).data();
      assert.deepEqual([w.deposit, w.winning], [15, 50]);
      const mm = (await getDoc(doc(db, 'matches/m1'))).data();
      assert.deepEqual([mm.status, mm.refunded, mm.refundedCount], ['cancelled', 20, 1]);
    });
  });
});

// ═══════════════════════ DEPOSITS & WITHDRAWALS ═══════════════════════
describe('Deposits & withdrawals', () => {
  const cfg = { ...DEFAULT_APP_CONFIG };

  test('withdrawal holds the winning balance and cannot exceed it', async () => {
    await assert.rejects(requestWithdrawal({ amount: 60, method: 'upi', account: 'alice@okaxis', holder: 'Alice', userEmail: 'alice@test.gg' }, cfg, ctxOf('alice')), /up to ₹50/);
    const r = await requestWithdrawal({ amount: 50, method: 'upi', account: 'alice@okaxis', holder: 'Alice', userEmail: 'alice@test.gg' }, cfg, ctxOf('alice'));
    await seed(async (db) => assert.equal((await getDoc(doc(db, 'wallets/alice'))).data().winning, 0));
    // Super Admin rejects → amount returns
    useCtx('super-1');
    await rejectWithdrawal({ id: r.id, uid: 'alice', amount: 50 }, 'Wrong UPI', { uid: 'super-1' });
    await seed(async (db) => assert.equal((await getDoc(doc(db, 'wallets/alice'))).data().winning, 50));
  });

  test('deposit balance can never be withdrawn directly', async () => {
    const db = asUser('alice');
    const b = writeBatch(db);
    b.set(doc(db, 'withdrawals/w1'), { uid: 'alice', userName: 'a', userEmail: 'alice@test.gg', amount: 100, method: 'upi', account: 'alice@okaxis', holder: 'Alice', status: 'pending', createdAt: serverTimestamp() });
    b.update(doc(db, 'wallets/alice'), { deposit: 0, winning: 50, updatedAt: serverTimestamp(), lastRef: { type: 'withdraw', id: 'w1' } });
    await assertFails(b.commit());
  });

  test('UPI deposit: UTR is unique; only permitted staff can approve', async () => {
    const d = await submitUpiDeposit({ amount: 100, utr: '412345678901', userName: 'Alice', userEmail: 'alice@test.gg' }, cfg, ctxOf('alice'));
    await assert.rejects(submitUpiDeposit({ amount: 100, utr: '412345678901', userName: 'Bob', userEmail: 'bob@test.gg' }, cfg, ctxOf('bob')), /already been submitted/);
    useCtx('staff-a');                                                  // perms.deposits = false
    await assert.rejects(approveDeposit({ id: d.id, uid: 'alice', amount: 100, utr: d.id }, { uid: 'staff-a' }));
    useCtx('super-1');
    await approveDeposit({ id: d.id, uid: 'alice', amount: 100, utr: d.id }, { uid: 'super-1' });
    await seed(async (db) => assert.equal((await getDoc(doc(db, 'wallets/alice'))).data().deposit, 200));
    await assert.rejects(approveDeposit({ id: d.id, uid: 'alice', amount: 100, utr: d.id }, { uid: 'super-1' }), /Already processed/);
  });
});
