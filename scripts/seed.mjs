// Demo data for the Firebase Emulator Suite (Admin SDK → bypasses rules, so we keep every
// counter/wallet consistent by hand).   Usage:  node scripts/seed.mjs
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ||= 'demo-fftournament';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';

const { initializeApp } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore, Timestamp } = await import('firebase-admin/firestore');

const PROJECT = 'demo-fftournament';
initializeApp({ projectId: PROJECT });
const auth = getAuth();
const db = getFirestore();

const now = Date.now();
const MIN = 60 * 1000;
const H = 60 * MIN;
const ts = (ms) => Timestamp.fromMillis(ms);

// ───────── wipe ─────────
await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const ops = [];
const set = (path, data) => ops.push([path, data]);

// ───────── config ─────────
set('config/app', {
  appName: 'FF Arena',
  upiId: 'ffarena@okaxis',
  upiName: 'FF Arena Esports',
  minDeposit: 10, maxDeposit: 10000, minWithdraw: 50, maxWithdraw: 10000,
  limits: { maxEntryFee: 1000, maxPerKill: 500, maxPrizePool: 100000, maxStaff: 15 },
  features: { upiManual: true, razorpay: false, tournapay: false, phoneOtp: true },
  announcement: '🔥 Diwali Mega Cup this Sunday – ₹10,000 prize pool! Daily solo matches at 8 PM. Withdrawals processed within 24h.',
  supportContact: 'WhatsApp +91 98765 00010',
  maintenance: false,
  createdAt: ts(now - 10 * 24 * H),
});

// ───────── staff (roles) ─────────
const STAFF = [
  { uid: 'owner-arjun', name: 'Arjun (Owner)', email: 'owner@ffarena.gg', password: 'Owner@123', role: 'super', active: true, perms: { deposits: true } },
  { uid: 'staff-rahul', name: 'Rahul', email: 'rahul.staff@ffarena.gg', password: 'Staff@123', role: 'staff', active: true, perms: { deposits: true } },
  { uid: 'staff-priya', name: 'Priya', email: 'priya.staff@ffarena.gg', password: 'Staff@123', role: 'staff', active: true, perms: { deposits: false } },
  { uid: 'staff-vikram', name: 'Vikram', email: 'vikram.staff@ffarena.gg', password: 'Staff@123', role: 'staff', active: false, perms: { deposits: false } },
];
for (const s of STAFF) {
  await auth.createUser({ uid: s.uid, email: s.email, password: s.password, displayName: s.name, emailVerified: true });
  set(`staff/${s.uid}`, { uid: s.uid, name: s.name, email: s.email, role: s.role, active: s.active, perms: s.perms, createdAt: ts(now - 9 * 24 * H), createdBy: 'owner-arjun' });
}

// ───────── players ─────────
const wallets = {};
const userDoc = (uid, name, email, phone, ign, ffUid, extra = {}) => set(`users/${uid}`, {
  uid, name, email, phone, ign, ffUid, phoneVerified: false, banned: false, createdAt: ts(now - 7 * 24 * H), ...extra,
});

const PLAYERS = [
  { uid: 'p-aman', name: 'Aman Verma', email: 'player1@ffarena.gg', phone: '9876543210', ign: 'AMAN×OP', ffUid: '1234567890', phoneVerified: true },
  { uid: 'p-rohit', name: 'Rohit Yadav', email: 'player2@ffarena.gg', phone: '9812345678', ign: 'ROHIT_YT', ffUid: '2234567890' },
  { uid: 'p-sneha', name: 'Sneha Kapoor', email: 'player3@ffarena.gg', phone: '9898989898', ign: '', ffUid: '' },
];
for (const p of PLAYERS) {
  await auth.createUser({
    uid: p.uid, email: p.email, password: 'Player@123', displayName: p.name, emailVerified: true,
    ...(p.phoneVerified ? { phoneNumber: `+91${p.phone}` } : {}),
  });
  userDoc(p.uid, p.name, p.email, p.phone, p.ign, p.ffUid, { phoneVerified: Boolean(p.phoneVerified) });
}

const BOT_IGNS = ['NoobMaster69', 'Gyan_Gaming', 'TotalGaming', 'LokeshX', 'DesiGamer', 'RaiStar', 'SKYLORD', 'BlackShadow', 'AjjuBhai', 'K4RT1K', 'Headshot_Hero',
  'VIPER.FF', 'Sultan007', 'MrSniper', 'Pahadi_Boy', 'QueenGamer', 'ZeroKill', 'Rusher_King', 'GhostRider', 'Thunder.OP', 'Lucky_FF', 'Tiger_Gaming', 'CRAZY_GIRL',
  'Mafia_Boss', 'BOOYAH_BOSS', 'ProBeast', 'Silent_Killer', 'Desi_Rusher', 'GodLike_FF', 'SpeedX'];
const BOTS = BOT_IGNS.map((ign, i) => ({ uid: `bot-${String(i + 1).padStart(2, '0')}`, ign, ffUid: String(3000000000 + i * 7919), name: ign.replace(/[_.×]/g, ' ') }));
BOTS.forEach((b) => {
  userDoc(b.uid, b.name, `${b.uid}@bots.ffarena.gg`, '', b.ign, b.ffUid);
  wallets[b.uid] = { deposit: 500, winning: 0 };
});

// ───────── ledger helpers ─────────
const txns = [];
const txn = (uid, type, amount, refId, note, at) => txns.push([`wallets/${uid}/txns/${type}_${refId}`, { type, amount, refId, note, createdAt: ts(at) }]);

wallets['p-aman'] = { deposit: 575, winning: 40 };
wallets['p-rohit'] = { deposit: 200, winning: 0 };
wallets['p-sneha'] = { deposit: 0, winning: 0 };
set('deposits/412398765432', { uid: 'p-aman', userName: 'Aman Verma', userEmail: 'player1@ffarena.gg', amount: 575, utr: '412398765432', method: 'upi', status: 'approved', createdAt: ts(now - 3 * 24 * H), processedBy: 'owner-arjun', processedAt: ts(now - 3 * 24 * H + 20 * MIN) });
txn('p-aman', 'deposit', 575, '412398765432', 'UPI deposit · UTR 412398765432', now - 3 * 24 * H + 20 * MIN);
txn('p-aman', 'adjust', 40, 'welcome-bonus', 'Referral bonus · 2 friends joined', now - 2 * 24 * H);
set('deposits/412311112222', { uid: 'p-rohit', userName: 'Rohit Yadav', userEmail: 'player2@ffarena.gg', amount: 200, utr: '412311112222', method: 'upi', status: 'approved', createdAt: ts(now - 2 * 24 * H), processedBy: 'staff-rahul', processedAt: ts(now - 2 * 24 * H + 9 * MIN) });
txn('p-rohit', 'deposit', 200, '412311112222', 'UPI deposit · UTR 412311112222', now - 2 * 24 * H + 9 * MIN);

// ───────── matches ─────────
const RULES = '• Join the custom room with your registered IGN only.\n• Emulator / PC players are not allowed.\n• Teaming or hacking = ban + no prize.\n• Room ID & password are shared 15 min before start.\n• Results are uploaded within 30 minutes of the match ending.';
const matches = [];
function match(id, m) {
  const doc = {
    title: m.title, type: m.type, map: m.map, startAt: ts(m.startAt), entryFee: m.entryFee, perKill: m.perKill,
    prizePool: m.prizePool, rankPrizes: m.rankPrizes, totalSlots: m.totalSlots, description: m.description ?? RULES,
    hostId: m.host.uid, hostName: m.host.name, status: m.status || 'upcoming',
    joinedCount: 0, collected: 0, rankPaid: 0, killsPaid: 0, distributed: 0, resultsCount: 0, refunded: 0, refundedCount: 0,
    roomPublishedAt: m.room ? ts(m.startAt - 14 * MIN) : null,
    createdAt: ts(m.startAt - 26 * H), updatedAt: ts(Math.min(now, m.startAt)),
  };
  matches.push({ id, doc, players: [], results: [], room: m.room });
  return matches[matches.length - 1];
}
function join(mt, player, slotNo, at) {
  const fee = mt.doc.entryFee;
  const w = wallets[player.uid];
  const fromDeposit = Math.min(w.deposit, fee);
  const fromWinning = fee - fromDeposit;
  w.deposit -= fromDeposit;
  w.winning -= fromWinning;
  mt.doc.joinedCount += 1;
  mt.doc.collected += fee;
  mt.players.push({ uid: player.uid, slotNo, ign: player.ign, ffUid: player.ffUid, fromDeposit, fromWinning, joinedAt: ts(at) });
  if (fee > 0) txn(player.uid, 'join', -fee, mt.id, `Entry fee · ${mt.doc.title}`, at);
}
function result(mt, uid, rank, kills, at) {
  const p = mt.players.find((x) => x.uid === uid);
  const killAmount = kills * mt.doc.perKill;
  const rankAmount = mt.doc.rankPrizes[String(rank)] || 0;
  const amount = killAmount + rankAmount;
  mt.doc.rankPaid += rankAmount;
  mt.doc.killsPaid += kills;
  mt.doc.distributed += amount;
  mt.doc.resultsCount += 1;
  mt.doc.lastResult = uid;
  mt.results.push({ uid, ign: p.ign, slotNo: p.slotNo, kills, rank, killAmount, rankAmount, amount, by: mt.doc.hostId, createdAt: ts(at) });
  if (amount > 0) {
    wallets[uid].winning += amount;
    txn(uid, 'win', amount, mt.id, `Won · #${rank} · ${kills} kills · ${mt.doc.title}`, at);
  }
}

const rahul = STAFF[1];
const priya = STAFF[2];
const aman = { uid: 'p-aman', ign: 'AMAN×OP', ffUid: '1234567890' };
const rohit = { uid: 'p-rohit', ign: 'ROHIT_YT', ffUid: '2234567890' };

// Completed yesterday (results published)
const m6 = match('bermuda-classic-100', { title: 'Bermuda Classic #100', type: 'solo', map: 'Bermuda', startAt: now - 24 * H, entryFee: 20, perKill: 5, prizePool: 400, rankPrizes: { 1: 200, 2: 120, 3: 80 }, totalSlots: 12, host: rahul, status: 'completed' });
join(m6, aman, 5, now - 26 * H);
BOTS.slice(0, 11).forEach((b, i) => join(m6, b, i < 4 ? i + 1 : i + 2, now - 27 * H + i * MIN));
const m6Ranks = [['bot-03', 1, 5], ['p-aman', 2, 4], ['bot-07', 3, 2], ['bot-01', 4, 1], ['bot-05', 5, 0], ['bot-02', 6, 0], ['bot-09', 7, 0], ['bot-04', 8, 0], ['bot-11', 9, 0], ['bot-06', 10, 0], ['bot-08', 11, 0], ['bot-10', 12, 0]];
m6Ranks.forEach(([uid, rank, kills], i) => result(m6, uid, rank, kills, now - 23 * H + i * 1000));

// LIVE now (room published) – Rahul can upload results here
const m5 = match('alpine-sniper-cup', { title: 'Alpine Sniper Cup', type: 'solo', map: 'Alpine', startAt: now - 10 * MIN, entryFee: 25, perKill: 5, prizePool: 500, rankPrizes: { 1: 250, 2: 150, 3: 100 }, totalSlots: 24, host: rahul, status: 'live', room: { roomId: '1849275', roomPass: 'ff123' } });
join(m5, aman, 3, now - 60 * MIN);
BOTS.slice(11, 22).forEach((b, i) => join(m5, b, i < 2 ? i + 1 : i + 2, now - 3 * H + i * MIN));

// Upcoming
const m1 = match('bermuda-solo-101', { title: 'Bermuda Solo Showdown #101', type: 'solo', map: 'Bermuda', startAt: now + 3 * H, entryFee: 20, perKill: 5, prizePool: 400, rankPrizes: { 1: 200, 2: 120, 3: 80 }, totalSlots: 48, host: rahul });
[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 20, 21, 30, 33, 40].forEach((slot, i) => join(m1, BOTS[i], slot, now - 5 * H + i * 7 * MIN));

const m2 = match('squad-night-clash', { title: 'Squad Night Clash', type: 'squad', map: 'Purgatory', startAt: now + 6 * H, entryFee: 50, perKill: 10, prizePool: 1600, rankPrizes: { 1: 250, 2: 100, 3: 50 }, totalSlots: 48, host: priya });
BOTS.slice(10, 18).forEach((b, i) => join(m2, b, i + 1, now - 4 * H + i * 5 * MIN));

const m3 = match('duo-kalahari-rush', { title: 'Duo Kalahari Rush', type: 'duo', map: 'Kalahari', startAt: now + 26 * H, entryFee: 30, perKill: 6, prizePool: 600, rankPrizes: { 1: 150, 2: 100, 3: 50 }, totalSlots: 48, host: rahul });
join(m3, aman, 7, now - 2 * H);
[1, 2, 3, 4, 9, 10].forEach((slot, i) => join(m3, BOTS[20 + i], slot, now - 6 * H + i * 9 * MIN));

const m4 = match('free-practice-scrim', { title: 'Free Practice Scrim', type: 'solo', map: 'NeXTerra', startAt: now + 28 * H, entryFee: 0, perKill: 2, prizePool: 100, rankPrizes: { 1: 50, 2: 30, 3: 20 }, totalSlots: 48, host: priya });
[1, 2, 3].forEach((slot, i) => join(m4, BOTS[26 + i], slot, now - H + i * MIN));

const m7 = match('purgatory-solo-night', { title: 'Purgatory Solo Night', type: 'solo', map: 'Purgatory', startAt: now + 50 * H, entryFee: 10, perKill: 3, prizePool: 200, rankPrizes: { 1: 100, 2: 60, 3: 40 }, totalSlots: 50, host: priya });
[2, 5, 11].forEach((slot, i) => join(m7, BOTS[i + 4], slot, now - 30 * MIN + i * MIN));

// Pending finance requests for the Super Admin queue
wallets['bot-03'].winning -= 150;
set('withdrawals/wd-demo-1', { uid: 'bot-03', userName: 'Gyan Gaming', userEmail: 'bot-03@bots.ffarena.gg', amount: 150, method: 'upi', account: 'gyan.gaming@okicici', holder: 'Gyan Prakash', status: 'pending', createdAt: ts(now - 40 * MIN) });
txn('bot-03', 'withdraw', -150, 'wd-demo-1', 'Withdrawal to UPI ID · gyan.gaming@okicici', now - 40 * MIN);
wallets['bot-07'].winning -= 50;
set('withdrawals/wd-demo-2', { uid: 'bot-07', userName: 'SKYLORD', userEmail: 'bot-07@bots.ffarena.gg', amount: 50, method: 'paytm', account: '9123456780', holder: 'Akash Singh', status: 'pending', createdAt: ts(now - 15 * MIN) });
txn('bot-07', 'withdraw', -50, 'wd-demo-2', 'Withdrawal to Paytm · 9123456780', now - 15 * MIN);
set('deposits/412355550001', { uid: 'p-rohit', userName: 'Rohit Yadav', userEmail: 'player2@ffarena.gg', amount: 100, utr: '412355550001', method: 'upi', status: 'pending', createdAt: ts(now - 25 * MIN) });
set('deposits/412355550002', { uid: 'p-sneha', userName: 'Sneha Kapoor', userEmail: 'player3@ffarena.gg', amount: 50, utr: '412355550002', method: 'upi', status: 'pending', createdAt: ts(now - 5 * MIN) });

// ───────── write everything ─────────
for (const mt of matches) {
  set(`matches/${mt.id}`, mt.doc);
  mt.players.forEach((p) => {
    set(`matches/${mt.id}/players/${p.uid}`, p);
    set(`matches/${mt.id}/slots/${p.slotNo}`, { slotNo: p.slotNo, uid: p.uid, ign: p.ign, ffUid: p.ffUid, joinedAt: p.joinedAt });
  });
  mt.results.forEach((r) => set(`matches/${mt.id}/results/${r.uid}`, r));
  if (mt.room) set(`matches/${mt.id}/private/room`, { ...mt.room, updatedAt: ts(mt.doc.startAt.toMillis() - 14 * MIN), by: mt.doc.hostId });
}
Object.entries(wallets).forEach(([uid, w]) => {
  set(`wallets/${uid}`, { deposit: w.deposit, winning: w.winning, updatedAt: ts(now), lastRef: { type: 'init', id: uid } });
});
txns.forEach(([path, data]) => set(path, data));

for (let i = 0; i < ops.length; i += 400) {
  const batch = db.batch();
  ops.slice(i, i + 400).forEach(([path, data]) => batch.set(db.doc(path), data));
  await batch.commit();
}

console.log(`✅ Seeded ${ops.length} documents: ${matches.length} matches, ${STAFF.length} staff, ${PLAYERS.length + BOTS.length} players`);
console.log(`   Aman wallet → deposit ₹${wallets['p-aman'].deposit}, winning ₹${wallets['p-aman'].winning}`);
console.log('   Super Admin: owner@ffarena.gg / Owner@123   Staff: rahul.staff@ffarena.gg / Staff@123');
console.log('   Player: player1@ffarena.gg / Player@123');
process.exit(0);
