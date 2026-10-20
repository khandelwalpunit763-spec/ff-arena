// End-to-end smoke test in a real browser (Playwright) against the demo server + emulators.
//   node scripts/seed.mjs && node tests/e2e.smoke.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png` });
const step = (msg) => console.log(`• ${msg}`);

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return page;
}

try {
  // ───────────── PLAYER ─────────────
  const p = await newPage({ width: 390, height: 844 });
  await p.goto(`${BASE}/#/login`);
  await p.waitForSelector('#login-form');
  await shot(p, '01-player-login');
  step('player login screen');

  await p.click('.demo-chip >> nth=0');
  await p.click('#login-btn');
  await p.waitForSelector('.match-card', { timeout: 15000 });
  await p.waitForTimeout(800);
  await shot(p, '02-player-home-upcoming');
  step('dashboard loaded (upcoming)');

  await p.click('[data-tab="live"]');
  await p.waitForTimeout(500);
  await shot(p, '03-player-home-live');
  await p.click('[data-tab="upcoming"]');

  // open match detail
  await p.click('.match-card:has-text("Bermuda Solo Showdown")');
  await p.waitForSelector('.detail-banner');
  await p.waitForTimeout(600);
  await shot(p, '04-player-match-detail');
  step('match detail');

  // join
  await p.click('.sticky-cta a.btn-primary');
  await p.waitForSelector('.seat-grid');
  await p.click('[data-slot="11"]');
  await p.waitForTimeout(300);
  await shot(p, '05-player-join-slot');
  const walletBefore = await p.textContent('#wallet-chip-amt');
  await p.click('#join-btn');
  await p.waitForSelector('.success-sheet', { timeout: 15000 });
  await shot(p, '06-player-join-success');
  step(`joined slot 11 (wallet before ${walletBefore})`);
  await p.click('[data-modal-action="0"]');
  await p.waitForSelector('.my-entry', { timeout: 10000 });
  await p.waitForTimeout(800);
  const walletAfter = await p.textContent('#wallet-chip-amt');
  step(`wallet after join: ${walletAfter}`);
  if (walletBefore === walletAfter) throw new Error('wallet did not change after join');

  // live match with published room
  await p.goto(`${BASE}/#/match/alpine-sniper-cup`);
  await p.waitForSelector('.room-card.ready', { timeout: 10000 });
  await shot(p, '07-player-room-details');
  step('room details visible for joined player');

  await p.goto(`${BASE}/#/wallet`);
  await p.waitForSelector('.txn', { timeout: 10000 });
  await shot(p, '08-player-wallet');
  step('wallet + ledger');

  await p.goto(`${BASE}/#/wallet/add`);
  await p.waitForSelector('.qr-box svg');
  await shot(p, '09-player-add-money');
  await p.fill('input[name=utr]', '412377778888');
  await p.click('#utr-btn');
  await p.waitForSelector('.txn', { timeout: 10000 });
  step('UPI deposit submitted with UTR');

  await p.goto(`${BASE}/#/wallet/withdraw`);
  await p.waitForSelector('#wd-form');
  await p.fill('input[name=amount]', '100');
  await p.fill('input[name=account]', 'aman@okaxis');
  await shot(p, '10-player-withdraw');
  await p.click('#wd-btn');
  await p.click('[data-modal-action="1"]');
  await p.waitForSelector('.txn', { timeout: 10000 });
  step('withdrawal requested');

  await p.goto(`${BASE}/#/my-matches`);
  await p.waitForSelector('.match-card', { timeout: 10000 });
  await shot(p, '11-player-my-matches');

  await p.goto(`${BASE}/#/profile`);
  await p.waitForSelector('#profile-form');
  await shot(p, '12-player-profile');
  await p.context().close();      // free HTTP/1.1 connections (6 per host) held by long-polling

  // signup + forgot screens (logged-out)
  const g = await newPage({ width: 390, height: 844 });
  await g.goto(`${BASE}/#/signup`);
  await g.waitForSelector('#signup-form');
  await shot(g, '13-player-signup');
  await g.fill('input[name=name]', 'Test Player');
  await g.fill('input[name=email]', `e2e${Date.now()}@test.gg`);
  await g.fill('input[name=phone]', '9123412345');
  await g.fill('input[name=password]', 'Secret@123');
  await g.fill('input[name=confirm]', 'Secret@123');
  await g.check('input[name=agree]');
  await g.click('#signup-btn');
  await g.waitForSelector('.hero-card', { timeout: 15000 });
  step('new user signed up → dashboard');
  await g.click('a[href="#/profile"]');
  await g.waitForSelector('#logout');
  await g.click('#logout');
  await g.click('[data-modal-action="1"]');
  await g.waitForSelector('#login-form');
  await g.goto(`${BASE}/#/forgot`);
  await g.click('[data-mode="otp"]');
  await g.fill('input[name=phone]', '9876543210');
  await g.click('#otp-send-btn');
  await g.waitForSelector('#demo-otp:has-text("Demo OTP")', { timeout: 15000 });
  const otpText = await g.textContent('#demo-otp');
  const otp = otpText.match(/(\d{6})/)[1];
  await g.fill('input[name=code]', otp);
  await shot(g, '14-player-forgot-otp');
  await g.click('#otp-verify-btn');
  await g.waitForSelector('#newpass-form', { timeout: 15000 });
  await g.fill('input[name=password]', 'Player@123');
  await g.fill('input[name=confirm]', 'Player@123');
  await g.click('#newpass-btn');
  await g.waitForSelector('.hero-card', { timeout: 15000 });
  step('forgot password via mobile OTP → new password set → logged in as Aman');
  await g.context().close();

  // ───────────── STAFF (Rahul) ─────────────
  const a = await newPage({ width: 1440, height: 900 });
  await a.goto(`${BASE}/admin.html#/login`);
  await a.waitForSelector('#staff-login');
  await shot(a, '20-admin-login');
  await a.click('.demo-chip >> nth=1');
  await a.click('#sl-btn');
  await a.waitForSelector('.stat-grid', { timeout: 15000 });
  await a.waitForTimeout(800);
  await shot(a, '21-staff-dashboard');
  step('staff dashboard');

  await a.goto(`${BASE}/admin.html#/create`);
  await a.waitForSelector('#match-form');
  await a.fill('input[name=title]', 'E2E Night Solo #1');
  await a.waitForTimeout(300);
  await shot(a, '22-staff-create-match');
  await a.click('#cm-submit');
  await a.waitForSelector('.manage-head', { timeout: 15000 });
  await a.waitForTimeout(500);
  await shot(a, '23-staff-manage-new-match');
  step('match created → manage screen (room locked until 15 min before)');

  await a.goto(`${BASE}/admin.html#/matches`);
  await a.waitForSelector('.dtable');
  await shot(a, '24-staff-my-matches');

  await a.goto(`${BASE}/admin.html#/match/alpine-sniper-cup`);
  await a.waitForSelector('.results-input', { timeout: 15000 });
  const rows = await a.$$('[data-rankin]');
  for (let i = 0; i < rows.length; i += 1) {
    const uid = await rows[i].getAttribute('data-rankin');
    await a.fill(`[data-rankin="${uid}"]`, String(i + 1));
    await a.fill(`[data-kills="${uid}"]`, String(i < 3 ? 3 - i : 0));
  }
  await a.waitForTimeout(300);
  await shot(a, '25-staff-result-upload');
  await a.click('#publish');
  await a.click('[data-modal-action="1"]');
  await a.waitForSelector('text=Final results', { timeout: 30000 });
  await a.waitForTimeout(600);
  await shot(a, '26-staff-results-published');
  step('results published + winnings distributed');
  await a.context().close();

  // ───────────── SUPER ADMIN ─────────────
  const s = await newPage({ width: 1440, height: 900 });
  await s.goto(`${BASE}/admin.html#/login`);
  await s.waitForSelector('#staff-login');
  await s.click('.demo-chip >> nth=0');
  await s.click('#sl-btn');
  await s.waitForSelector('#staff-perf .dtable', { timeout: 20000 });
  await s.waitForTimeout(600);
  await shot(s, '30-super-dashboard');
  step('super admin revenue dashboard');

  await s.goto(`${BASE}/admin.html#/withdrawals`);
  await s.waitForSelector('.fin-card', { timeout: 10000 });
  await shot(s, '31-super-withdrawals');
  await s.goto(`${BASE}/admin.html#/deposits`);
  await s.waitForSelector('.fin-card', { timeout: 10000 });
  await s.click('[data-approve] >> nth=0');
  await s.click('[data-modal-action="1"]');
  await s.waitForTimeout(1200);
  await shot(s, '32-super-deposits');
  step('deposit approved by super admin');
  await s.goto(`${BASE}/admin.html#/staff`);
  await s.waitForSelector('.staff-card', { timeout: 10000 });
  await shot(s, '33-super-staff');
  await s.goto(`${BASE}/admin.html#/settings`);
  await s.waitForSelector('#settings-form');
  await shot(s, '34-super-settings');
  await s.goto(`${BASE}/admin.html#/users`);
  await s.waitForSelector('.dtable', { timeout: 10000 });
  await shot(s, '35-super-users');

  await s.context().close();

  // Player sees winnings
  const p2 = await newPage({ width: 390, height: 844 });
  await p2.goto(`${BASE}/#/login`);
  await p2.waitForSelector('#login-form');
  await p2.click('.demo-chip >> nth=0');
  await p2.click('#login-btn');
  await p2.waitForSelector('.match-card', { timeout: 15000 });
  await p2.goto(`${BASE}/#/match/alpine-sniper-cup`);
  await p2.waitForSelector('.results-table', { timeout: 15000 });
  await p2.waitForTimeout(600);
  await shot(p2, '15-player-results');
  await p2.goto(`${BASE}/#/wallet`);
  await p2.waitForSelector('.txn', { timeout: 10000 });
  await p2.waitForTimeout(800);
  await shot(p2, '16-player-wallet-after-results');
  step(`player wallet after results: ${await p2.textContent('.balance-total')}`);
} catch (e) {
  console.error('❌ E2E failed:', e.message);
  process.exitCode = 1;
} finally {
  const relevant = errors.filter((e) => !/Failed to load resource|favicon/.test(e));
  if (relevant.length) { console.log('\nBrowser errors:'); relevant.forEach((e) => console.log('  ', e)); }
  await browser.close();
}
