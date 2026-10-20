// ADD MONEY – UPI intent / QR + UTR verification, Razorpay & TournaPay hooks
import qrcode from 'qrcode-generator';
import { html, raw, setHTML, $, on, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { inr } from '../../shared/format.js';
import { friendlyError } from '../../shared/errors.js';
import { setBusy, toast, copyText, emptyState } from '../../shared/ui.js';
import { submitUpiDeposit } from '../../services/wallet.service.js';
import { GATEWAYS, upiIntentUrl, openUpiApp, payWithRazorpay, payWithTournaPay } from '../../services/payment.service.js';
import { CONFIG } from '../../shared/config.js';
import { store, go } from '../app.js';

const CHIPS = [50, 100, 200, 500, 1000];

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

export default function AddMoneyScreen(el, params) {
  const d = createDisposer();
  const cfg = () => store.get().config;
  let amount = Math.max(Number(params.query.get('amount')) || 100, cfg().minDeposit);
  let gateway = null;

  function gateways() { return cfg().maintenance ? [] : GATEWAYS.filter((g) => g.enabled(cfg())); }

  function shell() {
    const list = gateways();
    if (!gateway || !list.some((g) => g.id === gateway)) gateway = list[0]?.id || null;
    setHTML(el, html`
      <section class="page add-money">
        <div class="card">
          <div class="card-head"><h3>${icon('arrowDown')} Add money</h3><span class="muted small">Min ${inr(cfg().minDeposit)} · Max ${inr(cfg().maxDeposit)}</span></div>
          <div class="amount-input"><span>₹</span><input type="number" inputmode="numeric" id="amount" min="${cfg().minDeposit}" max="${cfg().maxDeposit}" value="${amount}"></div>
          <div class="chip-row">${CHIPS.map((c) => html`<button type="button" class="amount-chip ${c === amount ? 'active' : ''}" data-amt="${c}">+${inr(c)}</button>`)}</div>
          <p class="hint">${icon('info')} Added money goes to your <b>Deposit balance</b> (used to join matches).</p>
        </div>
        ${list.length ? html`
          <div class="card">
            <div class="card-head"><h3>${icon('wallet')} Payment method</h3></div>
            <div class="option-list">
              ${list.map((g) => html`<label class="option ${g.id === gateway ? 'active' : ''}"><input type="radio" name="gw" value="${g.id}" ${g.id === gateway ? raw('checked') : ''}><span class="opt-body"><b>${g.label}</b><small>${g.sub}</small></span><span class="opt-check">${icon('check')}</span></label>`)}
            </div>
          </div>
          <div id="gw-panel"></div>` : emptyState({ iconName: 'alert', title: 'Deposits are paused', text: `Contact support${cfg().supportContact ? `: ${cfg().supportContact}` : ''}.` })}
      </section>`);
    renderPanel();
  }

  function renderPanel() {
    const panel = $('#gw-panel', el);
    if (!panel) return;
    const c = cfg();
    if (gateway === 'upi') {
      const url = upiIntentUrl({ pa: c.upiId, pn: c.upiName || CONFIG.brand.name, am: amount, tn: `${CONFIG.brand.name} wallet ${store.get().user.uid.slice(0, 6)}` });
      setHTML(panel, html`
        <div class="card upi-card">
          <div class="card-head"><h3><span class="step">1</span>Pay ${inr(amount)} via UPI</h3></div>
          <div class="upi-pay">
            <div class="qr-box">${raw(qrSvg(url))}</div>
            <div class="upi-info">
              <span class="muted small">Pay to UPI ID</span>
              <div class="upi-id"><b>${c.upiId}</b><button class="icon-btn" data-copy="${c.upiId}">${icon('copy')}</button></div>
              <span class="muted small">Name: ${c.upiName}</span>
              <a class="btn btn-primary btn-block" href="${url}" id="open-upi">${icon('external')}<span>Open UPI App</span></a>
              <small class="hint">On a phone this opens GPay / PhonePe / Paytm with the amount pre-filled. On desktop scan the QR.</small>
            </div>
          </div>
        </div>
        <form class="card form" id="utr-form" novalidate>
          <div class="card-head"><h3><span class="step">2</span>Submit payment reference</h3></div>
          <label class="field">
            <span class="field-label">UTR / UPI Reference No. (12 digits)</span>
            <input class="input" name="utr" maxlength="22" placeholder="e.g. 412345678901" required>
            <small class="hint">Find it in your UPI app → payment details → "UPI Ref No." / "UTR".</small>
          </label>
          <p class="form-error" id="utr-error"></p>
          <button class="btn btn-primary btn-block btn-lg" id="utr-btn">${icon('send')}<span>Submit for verification</span></button>
          <p class="hint center">Usually verified within 5–30 minutes. Balance is credited automatically after approval.</p>
        </form>`);
    } else if (gateway === 'razorpay') {
      setHTML(panel, html`<div class="card"><p class="muted">Pay securely with UPI, cards or netbanking. Your wallet is credited instantly after the server verifies the payment.</p><button class="btn btn-primary btn-block btn-lg" id="rzp-btn">${icon('zap')}<span>Pay ${inr(amount)} with Razorpay</span></button></div>`);
    } else if (gateway === 'tournapay') {
      setHTML(panel, html`<div class="card"><p class="muted">You'll be redirected to TournaPay to complete the payment.</p><button class="btn btn-primary btn-block btn-lg" id="tp-btn">${icon('zap')}<span>Pay ${inr(amount)} with TournaPay</span></button></div>`);
    } else setHTML(panel, '');
  }

  function setAmount(v, rerenderChips = true) {
    amount = Math.floor(Number(v) || 0);
    if (rerenderChips) el.querySelectorAll('.amount-chip').forEach((b) => b.classList.toggle('active', Number(b.dataset.amt) === amount));
    renderPanel();
  }

  function validAmount() {
    const c = cfg();
    if (amount < c.minDeposit) { toast(`Minimum deposit is ${inr(c.minDeposit)}`, 'warn'); return false; }
    if (amount > c.maxDeposit) { toast(`Maximum deposit is ${inr(c.maxDeposit)}`, 'warn'); return false; }
    return true;
  }

  shell();
  let cfgKey = JSON.stringify(cfg());
  d.add(store.subscribe((s) => { const k = JSON.stringify(s.config); if (k !== cfgKey) { cfgKey = k; shell(); } }, { immediate: false }));

  d.add(on(el, 'input', '#amount', (e, input) => setAmount(input.value)));
  d.add(on(el, 'click', '[data-amt]', (e, b) => { $('#amount', el).value = b.dataset.amt; setAmount(b.dataset.amt); }));
  d.add(on(el, 'change', 'input[name=gw]', (e, r) => { gateway = r.value; el.querySelectorAll('.option').forEach((o) => o.classList.toggle('active', o.contains(r))); renderPanel(); }));
  d.add(on(el, 'click', '[data-copy]', (e, b) => copyText(b.dataset.copy, 'UPI ID copied')));
  d.add(on(el, 'click', '#open-upi', (e, a) => { e.preventDefault(); if (validAmount()) openUpiApp(a.getAttribute('href')); }));

  d.add(on(el, 'submit', '#utr-form', async (e, form) => {
    e.preventDefault();
    if (!validAmount()) return;
    const btn = $('#utr-btn', el);
    const err = $('#utr-error', el);
    err.textContent = '';
    setBusy(btn, true, 'Submitting…');
    try {
      const { user, profile } = store.get();
      await submitUpiDeposit({ amount, utr: form.utr.value, userName: profile?.name, userEmail: user.email }, cfg());
      toast('Deposit submitted! It will be credited after verification.', 'success', 4000);
      go('/wallet?tab=requests', { replace: true });
    } catch (ex) {
      err.textContent = friendlyError(ex);
      setBusy(btn, false);
    }
  }));

  d.add(on(el, 'click', '#rzp-btn', async (e, btn) => {
    if (!validAmount()) return;
    setBusy(btn, true, 'Opening Razorpay…');
    try {
      const { user, profile } = store.get();
      await payWithRazorpay({ amount, email: user.email, name: profile?.name, phone: profile?.phone, brandName: CONFIG.brand.name });
      toast('Payment successful – wallet credited!', 'success');
      go('/wallet', { replace: true });
    } catch (ex) { toast(friendlyError(ex), 'error'); setBusy(btn, false); }
  }));
  d.add(on(el, 'click', '#tp-btn', async (e, btn) => {
    if (!validAmount()) return;
    setBusy(btn, true, 'Redirecting…');
    try { await payWithTournaPay({ amount }); } catch (ex) { toast(friendlyError(ex), 'error'); setBusy(btn, false); }
  }));

  return () => d.run();
}
