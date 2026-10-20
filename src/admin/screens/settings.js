// APP SETTINGS (Super Admin only) – UPI, limits, gateways, feature flags, announcement.
import { html, raw, setHTML, $, on, readForm, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { friendlyError } from '../../shared/errors.js';
import { toast, setBusy } from '../../shared/ui.js';
import { saveAppConfig } from '../../services/admin/config.service.js';
import { store } from '../app.js';

const num = (name, label, value, hint = '') => html`<label class="field"><span class="field-label">${label}</span><input class="input" type="number" min="0" name="${name}" value="${value}">${hint ? html`<small class="hint">${hint}</small>` : ''}</label>`;
const toggle = (name, label, sub, checked) => html`<label class="toggle-row boxed"><span><b>${label}</b><small class="muted">${sub}</small></span><span class="switch"><input type="checkbox" name="${name}" ${checked ? raw('checked') : ''}><span></span></span></label>`;

export default function SettingsScreen(el) {
  const d = createDisposer();
  const c = store.get().config;

  setHTML(el, html`
    <form class="settings-grid" id="settings-form">
      <div class="card form">
        <div class="form-section">${icon('wallet')} UPI deposits</div>
        <label class="field"><span class="field-label">Merchant UPI ID (players pay here)</span><input class="input" name="upiId" value="${c.upiId}" placeholder="yourbusiness@okaxis"></label>
        <label class="field"><span class="field-label">Payee name</span><input class="input" name="upiName" value="${c.upiName}"></label>
        <div class="grid-2">${num('minDeposit', 'Min deposit ₹', c.minDeposit)}${num('maxDeposit', 'Max deposit ₹', c.maxDeposit)}</div>
        <div class="form-section">${icon('arrowUp')} Withdrawals</div>
        <div class="grid-2">${num('minWithdraw', 'Min withdrawal ₹', c.minWithdraw)}${num('maxWithdraw', 'Max withdrawal ₹', c.maxWithdraw)}</div>
      </div>
      <div class="card form">
        <div class="form-section">${icon('shield')} Staff limits (enforced by rules)</div>
        <div class="grid-2">
          ${num('maxEntryFee', 'Max entry fee ₹', c.limits.maxEntryFee)}
          ${num('maxPerKill', 'Max per-kill ₹', c.limits.maxPerKill)}
          ${num('maxPrizePool', 'Max prize pool ₹', c.limits.maxPrizePool)}
          ${num('maxStaff', 'Max co-admins', c.limits.maxStaff)}
        </div>
        <div class="form-section">${icon('zap')} Payment gateways &amp; features</div>
        ${toggle('upiManual', 'UPI + UTR deposits', 'Manual verification by admin', c.features.upiManual)}
        ${toggle('razorpay', 'Razorpay auto-deposit', 'Requires Cloud Functions (functions/index.js)', c.features.razorpay)}
        ${toggle('tournapay', 'TournaPay auto-deposit', 'Hook – implement createTournaPayOrder', c.features.tournapay)}
        ${toggle('phoneOtp', 'Mobile OTP recovery', 'Firebase Phone Auth (Blaze plan for SMS)', c.features.phoneOtp)}
      </div>
      <div class="card form span-2">
        <div class="form-section">${icon('bell')} Player app</div>
        <label class="field"><span class="field-label">Announcement (scrolling banner on home)</span><input class="input" name="announcement" maxlength="200" value="${c.announcement}"></label>
        <label class="field"><span class="field-label">Support contact</span><input class="input" name="supportContact" maxlength="80" value="${c.supportContact}" placeholder="WhatsApp +91…"></label>
        ${toggle('maintenance', 'Maintenance mode', 'Blocks new joins & deposits in the player app', c.maintenance)}
        <div class="row-gap end"><button class="btn btn-primary btn-lg" id="save">${icon('check')}<span>Save settings</span></button></div>
      </div>
    </form>`);

  d.add(on(el, 'submit', '#settings-form', async (e, form) => {
    e.preventDefault();
    const v = readForm(form);
    const n = (k) => Math.max(0, Math.floor(Number(v[k]) || 0));
    const btn = $('#save', el);
    setBusy(btn, true, 'Saving…');
    try {
      await saveAppConfig({
        upiId: v.upiId, upiName: v.upiName,
        minDeposit: n('minDeposit'), maxDeposit: n('maxDeposit'), minWithdraw: n('minWithdraw'), maxWithdraw: n('maxWithdraw'),
        limits: { maxEntryFee: n('maxEntryFee'), maxPerKill: n('maxPerKill'), maxPrizePool: n('maxPrizePool'), maxStaff: n('maxStaff') },
        features: { upiManual: v.upiManual, razorpay: v.razorpay, tournapay: v.tournapay, phoneOtp: v.phoneOtp },
        announcement: v.announcement, supportContact: v.supportContact, maintenance: v.maintenance,
      });
      toast('Settings saved – live for all players', 'success');
    } catch (ex) { toast(friendlyError(ex), 'error'); }
    setBusy(btn, false);
  }));
  return () => d.run();
}
