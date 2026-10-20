// WITHDRAW – request payout of WINNING balance to UPI / Paytm / PhonePe / GPay
import { html, raw, setHTML, $, on, readForm, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { inr } from '../../shared/format.js';
import { WITHDRAW_METHODS } from '../../shared/constants.js';
import { friendlyError } from '../../shared/errors.js';
import { setBusy, toast, confirmDialog } from '../../shared/ui.js';
import { requestWithdrawal } from '../../services/wallet.service.js';
import { store, go } from '../app.js';

export default function WithdrawScreen(el) {
  const d = createDisposer();
  let method = 'upi';

  function render() {
    const { wallet, config, profile } = store.get();
    const winning = Number(wallet?.winning || 0);
    const m = WITHDRAW_METHODS[method];
    setHTML(el, html`
      <section class="page withdraw">
        <div class="balance-card compact">
          <div class="balance-top"><span class="muted">Withdrawable (winning) balance</span><strong class="balance-total">${inr(winning)}</strong></div>
          <p class="muted small">Deposit balance (${inr(wallet?.deposit)}) can only be used to join matches.</p>
        </div>
        <form class="card form" id="wd-form" novalidate>
          <label class="field">
            <span class="field-label">Amount <em>(min ${inr(config.minWithdraw)})</em></span>
            <div class="amount-input"><span>₹</span><input type="number" inputmode="numeric" name="amount" min="${config.minWithdraw}" max="${Math.min(winning, config.maxWithdraw)}" placeholder="0">
              <button type="button" class="btn btn-sm btn-ghost" data-max>MAX</button></div>
          </label>
          <span class="field-label">Payout method</span>
          <div class="method-grid">
            ${Object.entries(WITHDRAW_METHODS).map(([id, x]) => html`<label class="method ${id === method ? 'active' : ''}"><input type="radio" name="method" value="${id}" ${id === method ? raw('checked') : ''}><b>${x.label}</b></label>`)}
          </div>
          <label class="field">
            <span class="field-label">${method === 'upi' ? 'UPI ID' : `${m.label} number`}</span>
            <input class="input" name="account" placeholder="${m.placeholder}" ${method === 'upi' ? '' : raw('inputmode="numeric" maxlength="10"')} required>
            <small class="hint">${m.hint}</small>
          </label>
          <label class="field">
            <span class="field-label">Account holder name</span>
            <input class="input" name="holder" maxlength="60" value="${profile?.name || ''}" required>
          </label>
          <p class="form-error" id="wd-error"></p>
          <button class="btn btn-primary btn-block btn-lg" id="wd-btn" ${winning < config.minWithdraw ? raw('disabled') : ''}>${icon('send')}<span>Request withdrawal</span></button>
          ${winning < config.minWithdraw ? html`<p class="hint center">You need at least ${inr(config.minWithdraw)} in winning balance to withdraw.</p>` : html`<p class="hint center">Amount is held instantly and paid out after admin approval (usually within 24h).</p>`}
        </form>
      </section>`);
  }

  render();
  d.add(on(el, 'change', 'input[name=method]', (e, r) => {
    const prev = readForm($('#wd-form', el));       // keep typed amount / holder
    method = r.value;
    render();
    const form = $('#wd-form', el);
    form.amount.value = prev.amount || '';
    form.holder.value = prev.holder || form.holder.value;
  }));
  d.add(on(el, 'click', '[data-max]', () => {
    const { wallet, config } = store.get();
    $('input[name=amount]', el).value = Math.min(Number(wallet?.winning || 0), config.maxWithdraw);
  }));
  d.add(on(el, 'submit', '#wd-form', async (e, form) => {
    e.preventDefault();
    const v = readForm(form);
    const err = $('#wd-error', el);
    err.textContent = '';
    const { user, profile, config } = store.get();
    const ok = await confirmDialog({
      title: 'Confirm withdrawal',
      message: `Withdraw ₹${v.amount} to ${WITHDRAW_METHODS[method].label} (${v.account})? The amount will be held until the admin processes it.`,
      confirmText: 'Confirm',
    });
    if (!ok) return;
    const btn = $('#wd-btn', el);
    setBusy(btn, true, 'Submitting…');
    try {
      await requestWithdrawal({ ...v, method, userName: profile?.name, userEmail: user.email }, config);
      toast('Withdrawal requested ✅', 'success');
      go('/wallet?tab=requests', { replace: true });
    } catch (ex) {
      err.textContent = friendlyError(ex);
      setBusy(btn, false);
    }
  }));
  return () => d.run();
}
