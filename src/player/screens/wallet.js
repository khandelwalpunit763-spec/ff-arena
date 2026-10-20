// WALLET – balances, history (ledger) and deposit/withdraw request status
import { html, setHTML, $, on, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { inr, timeAgo, fmtDateTime } from '../../shared/format.js';
import { TXN_LABELS, WITHDRAW_METHODS } from '../../shared/constants.js';
import { emptyState } from '../../shared/ui.js';
import { listenTxns, listenMyWithdrawals, listenMyDeposits } from '../../services/wallet.service.js';
import { store, walletTotal } from '../app.js';

const TXN_ICON = { join: 'gamepad', win: 'trophy', refund: 'refresh', withdraw: 'arrowUp', wd_reject: 'refresh', deposit: 'arrowDown', adjust: 'settings' };

export default function WalletScreen(el, params) {
  const d = createDisposer();
  let tab = params.query.get('tab') === 'requests' ? 'requests' : 'history';
  let txns = null;
  let withdrawals = [];
  let deposits = [];
  const uid = store.get().user.uid;

  setHTML(el, html`
    <section class="page wallet">
      <div class="balance-card" id="balance"></div>
      <div class="wallet-actions">
        <a class="btn btn-primary btn-lg" href="#/wallet/add">${icon('arrowDown')}<span>Add Money</span></a>
        <a class="btn btn-outline btn-lg" href="#/wallet/withdraw">${icon('arrowUp')}<span>Withdraw</span></a>
      </div>
      <div class="seg-tabs" id="tabs">
        <button type="button" data-tab="history">${icon('history')} History</button>
        <button type="button" data-tab="requests">${icon('list')} Requests</button>
      </div>
      <div id="wallet-list" class="list-card card"></div>
    </section>`);

  function renderBalance() {
    const { wallet } = store.get();
    setHTML($('#balance', el), html`
      <div class="balance-top">
        <span class="muted">Total balance</span>
        <strong class="balance-total">${inr(walletTotal(wallet))}</strong>
      </div>
      <div class="balance-split">
        <div class="bal">
          <span class="bal-label">${icon('coins')} Deposit</span>
          <strong>${inr(wallet?.deposit)}</strong>
          <small>Use to join matches</small>
        </div>
        <div class="bal win">
          <span class="bal-label">${icon('trophy')} Winning</span>
          <strong>${inr(wallet?.winning)}</strong>
          <small>Withdrawable to UPI</small>
        </div>
      </div>`);
  }

  function statusChip(s) {
    const cls = { pending: 'chip-time', approved: 'chip-done', paid: 'chip-done', rejected: 'chip-cancel' }[s] || '';
    return html`<span class="chip small ${cls}">${s}</span>`;
  }

  function renderList() {
    el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const box = $('#wallet-list', el);
    if (tab === 'history') {
      if (!txns) { setHTML(box, html`<div class="sk sk-line"></div><div class="sk sk-line"></div>`); return; }
      if (!txns.length) { setHTML(box, emptyState({ iconName: 'history', title: 'No transactions yet', text: 'Add money and join your first match!' })); return; }
      setHTML(box, html`${txns.map((t) => html`
        <div class="txn">
          <div class="txn-icon t-${t.type}">${icon(TXN_ICON[t.type] || 'coins')}</div>
          <div class="txn-body"><b>${TXN_LABELS[t.type] || t.type}</b><small class="ellipsis">${t.note}</small></div>
          <div class="txn-amt ${t.amount >= 0 ? 'plus' : 'minus'}"><b>${t.amount >= 0 ? '+' : '−'}${inr(Math.abs(t.amount))}</b><small>${timeAgo(t.createdAt)}</small></div>
        </div>`)}`);
      return;
    }
    const reqs = [
      ...deposits.map((x) => ({ ...x, kind: 'deposit' })),
      ...withdrawals.map((x) => ({ ...x, kind: 'withdraw' })),
    ].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    if (!reqs.length) { setHTML(box, emptyState({ iconName: 'list', title: 'No requests', text: 'Deposit and withdrawal requests appear here.' })); return; }
    setHTML(box, html`${reqs.map((r) => html`
      <div class="txn">
        <div class="txn-icon t-${r.kind === 'deposit' ? 'deposit' : 'withdraw'}">${icon(r.kind === 'deposit' ? 'arrowDown' : 'arrowUp')}</div>
        <div class="txn-body">
          <b>${r.kind === 'deposit' ? 'UPI deposit' : `Withdraw · ${WITHDRAW_METHODS[r.method]?.label || r.method}`}</b>
          <small class="ellipsis">${r.kind === 'deposit' ? `UTR ${r.utr}` : r.account} · ${fmtDateTime(r.createdAt)}</small>
          ${r.reason ? html`<small class="text-red">${r.reason}</small>` : ''}
          ${r.txnRef ? html`<small class="text-green">Ref: ${r.txnRef}</small>` : ''}
        </div>
        <div class="txn-amt"><b>${inr(r.amount)}</b>${statusChip(r.status)}</div>
      </div>`)}`);
  }

  d.add(store.subscribe(() => renderBalance()));
  d.add(listenTxns(uid, (t) => { txns = t; if (tab === 'history') renderList(); }, () => { txns = []; renderList(); }));
  d.add(listenMyWithdrawals(uid, (w) => { withdrawals = w; if (tab === 'requests') renderList(); }, () => {}));
  d.add(listenMyDeposits(uid, (x) => { deposits = x; if (tab === 'requests') renderList(); }, () => {}));
  d.add(on(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; renderList(); }));
  renderList();
  return () => d.run();
}
