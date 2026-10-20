// MANAGE MATCHES – staff see only matches they host (hostId == me); Super Admin sees all + staff filter.
import { html, raw, setHTML, $, on, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { inr, fmtDateTime, shortId } from '../../shared/format.js';
import { MATCH_TYPES } from '../../shared/constants.js';
import { friendlyError } from '../../shared/errors.js';
import { emptyState } from '../../shared/ui.js';
import { listenHostMatches } from '../../services/admin/admin-match.service.js';
import { listenAllStaff } from '../../services/admin/staff.service.js';
import { statusBadge } from '../components/badges.js';
import { isSuper, me, go } from '../app.js';

const TABS = ['all', 'upcoming', 'live', 'completed', 'cancelled'];

export default function MatchesScreen(el, params) {
  const d = createDisposer();
  const superAdmin = isSuper();
  let tab = TABS.includes(params.query.get('status')) ? params.query.get('status') : 'all';
  let hostFilter = superAdmin ? (params.query.get('host') || '') : me().uid;
  let search = '';
  let matches = null;
  let staff = [];
  let unsub = null;

  setHTML(el, html`
    <div class="toolbar">
      <div class="seg-tabs compact" id="tabs">${TABS.map((t) => html`<button type="button" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}<b class="count" data-count="${t}"></b></button>`)}</div>
      <div class="toolbar-right">
        <div class="input-wrap search">${icon('search')}<input class="input" id="search" placeholder="Search title / ID"></div>
        ${superAdmin ? html`<select class="input" id="host-filter"><option value="">All staff</option></select>` : ''}
        <a class="btn btn-primary" href="#/create">${icon('plus')}<span>New</span></a>
      </div>
    </div>
    <div class="card no-pad" id="table"></div>`);

  function render() {
    el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const box = $('#table', el);
    if (!matches) { setHTML(box, html`<div class="pad"><div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>`); return; }
    TABS.forEach((t) => {
      const c = el.querySelector(`[data-count="${t}"]`);
      if (c) c.textContent = t === 'all' ? '' : (matches.filter((m) => m.status === t).length || '');
    });
    const q = search.toLowerCase();
    const list = matches.filter((m) => (tab === 'all' || m.status === tab) && (!q || m.title.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)));
    if (!list.length) { setHTML(box, emptyState({ iconName: 'trophy', title: 'No matches found', text: superAdmin ? 'Try another filter.' : 'Matches you create appear here.', action: '<a class="btn btn-primary btn-sm" href="#/create">Create match</a>' })); return; }
    setHTML(box, html`<div class="dtable-wrap"><table class="dtable hover">
      <thead><tr><th>Match</th><th>Start</th><th>Slots</th><th>Collected</th><th>Prizes</th><th>Status</th>${superAdmin ? html`<th>Host</th>` : ''}<th></th></tr></thead>
      <tbody>${list.map((m) => html`<tr data-go="/match/${m.id}">
        <td><b>${m.title}</b><br><small class="muted">#${shortId(m.id)} · ${MATCH_TYPES[m.type]?.label} · ${m.map}</small></td>
        <td>${fmtDateTime(m.startAt)}</td>
        <td><div class="slot-cell"><span>${m.joinedCount}/${m.totalSlots}</span><div class="progress"><i style="width:${Math.round((m.joinedCount / m.totalSlots) * 100)}%"></i></div></div></td>
        <td>${inr(m.collected)}</td>
        <td>${inr(m.distributed)}</td>
        <td>${statusBadge(m)}</td>
        ${superAdmin ? html`<td><span class="chip chip-staff small">${m.hostName}</span></td>` : ''}
        <td><a class="btn btn-sm btn-outline" href="#/match/${m.id}">Manage ${raw(String(icon('chevronRight')))}</a></td>
      </tr>`)}</tbody></table></div>`);
  }

  function subscribe() {
    if (unsub) unsub();
    matches = null;
    render();
    unsub = listenHostMatches({ hostId: hostFilter || null }, (list) => { matches = list; render(); }, (e) => setHTML($('#table', el), html`<div class="notice danger">${friendlyError(e)}</div>`));
  }

  subscribe();
  d.add(() => unsub && unsub());
  if (superAdmin) {
    d.add(listenAllStaff((list) => {
      staff = list;
      const sel = $('#host-filter', el);
      if (sel) setHTML(sel, html`<option value="">All staff (${staff.length})</option>${staff.map((s) => html`<option value="${s.uid}" ${s.uid === hostFilter ? raw('selected') : ''}>${s.name}${s.role === 'super' ? ' (Super)' : ''}</option>`)}`);
    }));
    d.add(on(el, 'change', '#host-filter', (e, sel) => { hostFilter = sel.value; subscribe(); }));
  }
  d.add(on(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; render(); }));
  d.add(on(el, 'input', '#search', (e, i) => { search = i.value; render(); }));
  d.add(on(el, 'click', 'tr[data-go]', (e, tr) => { if (!e.target.closest('a,button')) go(tr.dataset.go); }));
  return () => d.run();
}
