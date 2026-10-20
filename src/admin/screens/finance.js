// FINANCE – Deposits (UTR verification) & Withdrawals (Super Admin approval).
import { html, setHTML, $, on, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { inr, fmtDateTime, timeAgo } from '../../shared/format.js';
import { WITHDRAW_METHODS } from '../../shared/constants.js';
import { friendlyError } from '../../shared/errors.js';
import { toast, promptDialog, confirmDialog, copyText, emptyState, setBusy } from '../../shared/ui.js';
import { upiIntentUrl } from '../../services/payment.service.js';
import {
  listenDeposits, approveDeposit, rejectDeposit, listenWithdrawals, markWithdrawalPaid, rejectWithdrawal,
} from '../../services/admin/finance.service.js';
import { me } from '../app.js';

function financeScreen(el, { kind }) {
  const d = createDisposer();
  const isDep = kind === 'deposits';
  const tabs = isDep ? ['pending', 'approved', 'rejected'] : ['pending', 'paid', 'rejected'];
  let tab = 'pending';
  let list = null;
  let unsub = null;

  setHTML(el, html`
    <div class="toolbar">
      <div class="seg-tabs compact">${tabs.map((t) => html`<button type="button" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`)}</div>
      <div class="toolbar-right"><span class="muted small" id="sum"></span></div>
    </div>
    ${isDep ? html`<div class="notice mb-12">${icon('info')}<span>Open your bank / UPI merchant app, confirm a credit with the same <b>UTR</b> and amount, then approve. Approval credits the player's <b>Deposit balance</b> instantly. Each UTR can be claimed only once.</span></div>`
      : html`<div class="notice mb-12">${icon('info')}<span>The amount is already held from the player's winning balance. Pay it via UPI/Paytm/PhonePe, then <b>Mark paid</b> with your payment reference. <b>Reject</b> returns the money to the player's winning balance.</span></div>`}
    <div class="fin-list" id="list"></div>`);

  function render() {
    el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const box = $('#list', el);
    if (!list) { setHTML(box, html`<div class="card"><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>`); return; }
    $('#sum', el).textContent = list.length ? `${list.length} request(s) · ${inr(list.reduce((a, x) => a + x.amount, 0))}` : '';
    if (!list.length) { setHTML(box, emptyState({ iconName: isDep ? 'arrowDown' : 'arrowUp', title: `No ${tab} ${isDep ? 'deposits' : 'withdrawals'}`, text: tab === 'pending' ? 'All caught up! 🎉' : '' })); return; }
    setHTML(box, html`${list.map((x) => html`
      <div class="card fin-card">
        <div class="fin-amt"><strong>${inr(x.amount)}</strong><small>${timeAgo(x.createdAt)}</small></div>
        <div class="fin-body">
          <b>${x.userName || 'Player'}</b> <span class="muted small">${x.userEmail}</span>
          ${isDep
            ? html`<div class="fin-line">UTR <button class="copy-cell" data-copy="${x.utr}">${x.utr} ${icon('copy')}</button></div>`
            : html`<div class="fin-line">${WITHDRAW_METHODS[x.method]?.label}: <button class="copy-cell" data-copy="${x.account}">${x.account} ${icon('copy')}</button> · Holder: <b>${x.holder}</b></div>`}
          <small class="muted">Requested ${fmtDateTime(x.createdAt)}${x.processedAt ? ` · processed ${fmtDateTime(x.processedAt)}` : ''}</small>
          ${x.reason ? html`<small class="text-red">Reason: ${x.reason}</small>` : ''}
          ${x.txnRef ? html`<small class="text-green">Payout ref: ${x.txnRef}</small>` : ''}
        </div>
        ${x.status === 'pending' ? html`<div class="fin-actions">
          ${!isDep && x.method === 'upi' ? html`<a class="btn btn-ghost btn-sm" href="${upiIntentUrl({ pa: x.account, pn: x.holder, am: x.amount, tn: 'FF Arena winnings' })}">${icon('external')}<span>Pay via UPI</span></a>` : ''}
          <button class="btn btn-success btn-sm" data-approve="${x.id}">${icon('check')}<span>${isDep ? 'Approve' : 'Mark paid'}</span></button>
          <button class="btn btn-danger btn-sm" data-reject="${x.id}">${icon('x')}<span>Reject</span></button>
        </div>` : html`<span class="chip ${x.status === 'rejected' ? 'chip-cancel' : 'chip-done'}">${x.status}</span>`}
      </div>`)}`);
  }

  function subscribe() {
    if (unsub) unsub();
    list = null;
    render();
    const fn = isDep ? listenDeposits : listenWithdrawals;
    unsub = fn(tab, (l) => { list = l; render(); }, (e) => setHTML($('#list', el), html`<div class="notice danger">${friendlyError(e)}</div>`));
  }
  subscribe();
  d.add(() => unsub && unsub());

  d.add(on(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; subscribe(); }));
  d.add(on(el, 'click', '[data-copy]', (e, b) => copyText(b.dataset.copy)));
  d.add(on(el, 'click', '[data-approve]', async (e, btn) => {
    const x = list.find((i) => i.id === btn.dataset.approve);
    try {
      if (isDep) {
        if (!await confirmDialog({ title: `Approve ${inr(x.amount)}?`, message: `Confirm you received ${inr(x.amount)} with UTR ${x.utr}. The player's deposit balance will be credited.`, confirmText: 'Approve & credit' })) return;
        setBusy(btn, true, '…');
        await approveDeposit(x, me());
        toast(`${inr(x.amount)} credited to ${x.userName}`, 'success');
      } else {
        const v = await promptDialog({ title: `Mark ${inr(x.amount)} as paid`, message: `Paid to ${x.account} (${x.holder})?`, fields: [{ name: 'ref', label: 'Payout reference / UTR', required: true, placeholder: 'e.g. 412398765432' }], confirmText: 'Mark paid' });
        if (!v) return;
        setBusy(btn, true, '…');
        await markWithdrawalPaid(x, v.ref, me());
        toast('Withdrawal marked as paid', 'success');
      }
    } catch (ex) { toast(friendlyError(ex), 'error'); setBusy(btn, false); }
  }));
  d.add(on(el, 'click', '[data-reject]', async (e, btn) => {
    const x = list.find((i) => i.id === btn.dataset.reject);
    const v = await promptDialog({
      title: `Reject ${inr(x.amount)}?`,
      message: isDep ? 'The player will see this reason.' : 'The held amount returns to the player\'s winning balance.',
      fields: [{ name: 'reason', label: 'Reason', required: true, value: isDep ? 'Payment not received / UTR mismatch' : 'Invalid payout details' }],
      confirmText: 'Reject', danger: true,
    });
    if (!v) return;
    setBusy(btn, true, '…');
    try {
      if (isDep) await rejectDeposit(x, v.reason, me());
      else await rejectWithdrawal(x, v.reason, me());
      toast('Request rejected', 'success');
    } catch (ex) { toast(friendlyError(ex), 'error'); setBusy(btn, false); }
  }));
  return () => d.run();
}

export const DepositsScreen = (el) => financeScreen(el, { kind: 'deposits' });
export const WithdrawalsScreen = (el) => financeScreen(el, { kind: 'withdrawals' });
