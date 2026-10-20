// DASHBOARD – Staff: my hosting stats.  Super Admin: platform revenue + staff performance.
import { html, setHTML, $, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { inr, fmtDateTime, toMillis } from '../../shared/format.js';
import { MATCH_TYPES } from '../../shared/constants.js';
import { friendlyError } from '../../shared/errors.js';
import { emptyState, countdown } from '../../shared/ui.js';
import { listenHostMatches } from '../../services/admin/admin-match.service.js';
import { fetchRevenueStats } from '../../services/admin/finance.service.js';
import { listenAllStaff } from '../../services/admin/staff.service.js';
import { statusBadge } from '../components/badges.js';
import { store, isSuper, me } from '../app.js';

const stat = (label, value, iconName, tone = '', sub = '') => html`
  <div class="stat-card ${tone}">
    <div class="stat-icon">${icon(iconName)}</div>
    <div><span>${label}</span><strong>${value}</strong>${sub ? html`<small>${sub}</small>` : ''}</div>
  </div>`;

export default function DashboardScreen(el) {
  const d = createDisposer();
  const superAdmin = isSuper();
  let matches = null;
  let revenue = null;
  let revenueError = '';

  setHTML(el, html`<div class="dash">
    <div class="welcome card">
      <div><p class="muted small">Welcome back</p><h2>${store.get().staff.name} ${superAdmin ? '👑' : '🎮'}</h2>
      <p class="muted">${superAdmin ? 'Full control: staff, revenue, withdrawals and settings.' : 'Host, manage and settle your tournaments.'}</p></div>
      <a class="btn btn-primary" href="#/create">${icon('plus')}<span>Create match</span></a>
    </div>
    ${superAdmin ? html`<div id="revenue"></div>` : ''}
    <div id="my-stats"></div>
    <div class="grid-dash">
      <div class="card" id="upcoming-card"></div>
      <div class="card" id="live-card"></div>
    </div>
    ${superAdmin ? html`<div class="card" id="staff-perf"></div>` : ''}
  </div>`);

  function renderMine() {
    if (!matches) return;
    const mine = superAdmin ? matches : matches.filter((m) => m.hostId === me().uid);
    const by = (s) => mine.filter((m) => m.status === s);
    const collected = mine.reduce((a, m) => a + (m.collected || 0), 0);
    const distributed = mine.reduce((a, m) => a + (m.distributed || 0), 0);
    const refunded = mine.reduce((a, m) => a + (m.refunded || 0), 0);
    const players = mine.filter((m) => ['upcoming', 'live'].includes(m.status)).reduce((a, m) => a + (m.joinedCount || 0), 0);
    setHTML($('#my-stats', el), html`
      <div class="section-title">${superAdmin ? 'Match activity (all staff)' : 'My hosting stats'}</div>
      <div class="stat-grid">
        ${stat('Upcoming', by('upcoming').length, 'clock')}
        ${stat('Live now', by('live').length, 'radio', 'tone-red')}
        ${stat('Completed', by('completed').length, 'check', 'tone-green')}
        ${superAdmin ? html`
          ${stat('Players in open matches', players, 'users')}
          ${stat('Cancelled', by('cancelled').length, 'ban')}`
        : html`
          ${stat('Entry fees collected', inr(collected), 'coins', 'tone-gold')}
          ${stat('Prizes distributed', inr(distributed), 'trophy')}
          ${stat('Net (fees − prizes − refunds)', inr(collected - distributed - refunded), 'rupee', 'tone-green')}`}
      </div>`);

    const upcoming = by('upcoming').sort((a, b) => toMillis(a.startAt) - toMillis(b.startAt)).slice(0, 6);
    setHTML($('#upcoming-card', el), html`
      <div class="card-head"><h3>${icon('clock')} Upcoming</h3><a class="link small" href="#/matches">View all</a></div>
      ${upcoming.length ? html`<div class="mini-list">${upcoming.map((m) => html`
        <a class="mini-row" href="#/match/${m.id}">
          <div class="ellipsis"><b class="ellipsis">${m.title}</b><small>${MATCH_TYPES[m.type]?.label} · ${m.map} · ${fmtDateTime(m.startAt)}${superAdmin ? ` · ${m.hostName}` : ''}</small></div>
          <span class="mini-meta"><b>${m.joinedCount}/${m.totalSlots}</b><small>${countdown(toMillis(m.startAt), { done: 'Starting' })}</small></span>
        </a>`)}</div>` : emptyState({ iconName: 'calendar', title: 'No upcoming matches', action: '<a class="btn btn-primary btn-sm" href="#/create">Create one</a>' })}`);

    const live = by('live');
    setHTML($('#live-card', el), html`
      <div class="card-head"><h3>${icon('radio')} Live – awaiting results</h3></div>
      ${live.length ? html`<div class="mini-list">${live.map((m) => html`
        <a class="mini-row" href="#/match/${m.id}">
          <div class="ellipsis"><b class="ellipsis">${m.title}</b><small>${m.joinedCount} players · started ${fmtDateTime(m.startAt)}</small></div>
          ${statusBadge(m)}
        </a>`)}</div>` : emptyState({ iconName: 'radio', title: 'Nothing live', text: 'Matches you start appear here until results are published.' })}`);
  }

  function renderRevenue() {
    const box = $('#revenue', el);
    if (!box) return;
    if (revenueError) { setHTML(box, html`<div class="notice danger">${icon('alert')}<span>${revenueError}</span></div>`); return; }
    if (!revenue) { setHTML(box, html`<div class="stat-grid">${[1, 2, 3, 4].map(() => html`<div class="stat-card"><div class="sk sk-line"></div></div>`)}</div>`); return; }
    const r = revenue;
    setHTML(box, html`
      <div class="section-title">Platform revenue (all staff)</div>
      <div class="stat-grid">
        ${stat('Net revenue', inr(r.revenue), 'rupee', 'tone-green', 'fees − prizes − refunds')}
        ${stat('Entry fees collected', inr(r.collected), 'coins', 'tone-gold', `${r.matches} matches`)}
        ${stat('Prizes distributed', inr(r.distributed), 'trophy')}
        ${stat('Refunds', inr(r.refunded), 'refresh')}
        ${stat('Deposits approved', inr(r.depositsApproved.amount), 'arrowDown', '', `${r.depositsApproved.n} deposits`)}
        ${stat('Withdrawals paid', inr(r.withdrawalsPaid.amount), 'arrowUp', '', `${r.withdrawalsPaid.n} payouts`)}
      </div>
      ${r.withdrawalsPending.n ? html`<a class="notice warn pending-alert" href="#/withdrawals">${icon('alert')}<span><b>${r.withdrawalsPending.n} withdrawal request(s)</b> pending · ${inr(r.withdrawalsPending.amount)} to pay → Review now</span></a>` : ''}`);

    setHTML($('#staff-perf', el), html`
      <div class="card-head"><h3>${icon('shield')} Staff performance</h3><a class="link small" href="#/staff">Manage staff</a></div>
      <div class="dtable-wrap"><table class="dtable">
        <thead><tr><th>Staff</th><th>Role</th><th>Matches</th><th>Collected</th><th>Distributed</th><th>Refunded</th><th>Profit</th></tr></thead>
        <tbody>${r.perStaff.map((s) => html`<tr>
          <td><b>${s.name}</b><br><small class="muted">${s.email}</small></td>
          <td><span class="chip ${s.role === 'super' ? 'chip-super' : 'chip-staff'} small">${s.role}</span>${s.active ? '' : html` <span class="chip chip-cancel small">disabled</span>`}</td>
          <td>${s.matches}</td><td>${inr(s.collected)}</td><td>${inr(s.distributed)}</td><td>${inr(s.refunded)}</td>
          <td class="${s.profit >= 0 ? 'text-green' : 'text-red'}"><b>${inr(s.profit)}</b></td>
        </tr>`)}</tbody>
      </table></div>`);
  }

  d.add(listenHostMatches({ hostId: superAdmin ? null : me().uid }, (list) => { matches = list; renderMine(); }, (e) => setHTML($('#my-stats', el), html`<div class="notice danger">${friendlyError(e)}</div>`)));
  if (superAdmin) {
    renderRevenue();
    let loaded = false;
    d.add(listenAllStaff(async (staff) => {
      if (loaded) return;
      loaded = true;
      try { revenue = await fetchRevenueStats(staff); } catch (e) { revenueError = friendlyError(e); }
      renderRevenue();
    }));
  }
  return () => d.run();
}
