// DASHBOARD – Live / Upcoming / Completed tournaments (real-time)
import { html, setHTML, $, on, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { inr } from '../../shared/format.js';
import { friendlyError } from '../../shared/errors.js';
import { emptyState, skeletonCards } from '../../shared/ui.js';
import { listenMatchesByStatus } from '../../services/match.service.js';
import { matchCard } from '../components/match-card.js';
import { store, go, walletTotal } from '../app.js';

const TABS = [
  { id: 'live', label: 'Live', icon: 'radio' },
  { id: 'upcoming', label: 'Upcoming', icon: 'clock' },
  { id: 'completed', label: 'Completed', icon: 'check' },
];

export default function HomeScreen(el, params) {
  const d = createDisposer();
  let tab = TABS.some((t) => t.id === params.query.get('tab')) ? params.query.get('tab') : 'upcoming';
  const lists = { live: null, upcoming: null, completed: null };
  const errors = {};

  setHTML(el, html`
    <section class="page home">
      <div class="hero-card" id="hero"></div>
      <div id="announcement"></div>
      <div class="section-head">
        <h2>Tournaments</h2>
        <span class="muted small">Real-time</span>
      </div>
      <div class="seg-tabs sticky-tabs" role="tablist" id="tabs">
        ${TABS.map((t) => html`<button type="button" role="tab" data-tab="${t.id}">${t.id === 'live' ? html`<i class="dot live-dot"></i>` : ''}${t.label}<b class="count" data-count="${t.id}"></b></button>`)}
      </div>
      <div class="match-list" id="match-list">${skeletonCards(3)}</div>
    </section>`);

  function renderHero() {
    const { profile, wallet, entries, config } = store.get();
    const first = (profile?.name || 'Survivor').split(' ')[0];
    setHTML($('#hero', el), html`
      <div class="hero-left">
        <p class="muted small">Welcome back</p>
        <h2>Hi, ${first} <span class="wave">👋</span></h2>
        <p class="hero-sub">${entries.size ? html`You're registered in <b>${entries.size}</b> match${entries.size > 1 ? 'es' : ''}` : 'Pick a match & drop in!'}</p>
      </div>
      <a class="hero-wallet" href="#/wallet">
        <span class="muted small">Wallet</span>
        <strong>${inr(walletTotal(wallet))}</strong>
        <span class="hero-add">${icon('plus')} Add cash</span>
      </a>`);
    setHTML($('#announcement', el), html`
      ${config.maintenance ? html`<div class="notice warn mb-12">${icon('alert')}<span><b>Maintenance in progress</b> – joining &amp; deposits are paused for a short while.</span></div>` : ''}
      ${config.announcement ? html`<div class="announcement">${icon('bell')}<div class="marquee"><span>${config.announcement}</span></div></div>` : ''}`);
  }

  function renderTabs() {
    el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    TABS.forEach((t) => {
      const c = el.querySelector(`[data-count="${t.id}"]`);
      if (c) c.textContent = lists[t.id] && t.id !== 'completed' && lists[t.id].length ? lists[t.id].length : '';
    });
  }

  function renderList() {
    const box = $('#match-list', el);
    if (errors[tab]) { setHTML(box, emptyState({ iconName: 'alert', title: 'Could not load matches', text: errors[tab] })); return; }
    const list = lists[tab];
    if (!list) { setHTML(box, skeletonCards(3)); return; }
    if (!list.length) {
      const msg = {
        live: ['No live matches right now', 'Matches appear here when the host starts them.'],
        upcoming: ['No upcoming matches', 'New tournaments are added daily – check back soon!'],
        completed: ['No completed matches yet', 'Results of finished matches will show here.'],
      }[tab];
      setHTML(box, emptyState({ iconName: tab === 'completed' ? 'trophy' : 'gamepad', title: msg[0], text: msg[1] }));
      return;
    }
    const { entries } = store.get();
    setHTML(box, html`${list.map((m) => matchCard(m, entries.get(m.id)))}`);
  }

  TABS.forEach((t) => {
    d.add(listenMatchesByStatus(t.id, (data) => {
      lists[t.id] = data;
      errors[t.id] = null;
      renderTabs();
      if (t.id === tab) renderList();
    }, (err) => { errors[t.id] = friendlyError(err); if (t.id === tab) renderList(); }));
  });

  d.add(store.subscribe(() => { renderHero(); renderList(); }));
  renderTabs();

  d.add(on(el, 'click', '[data-tab]', (e, btn) => {
    tab = btn.dataset.tab;
    history.replaceState(null, '', `#/home?tab=${tab}`);
    renderTabs();
    renderList();
  }));
  d.add(on(el, 'click', '.match-card', (e, card) => {
    if (e.target.closest('a,button')) return;
    go(card.dataset.href.slice(1));
  }));

  return () => d.run();
}
