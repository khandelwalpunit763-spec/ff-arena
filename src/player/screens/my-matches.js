// MY MATCHES – everything I joined (collection-group query on players)
import { html, setHTML, $, on, createDisposer } from '../../shared/dom.js';
import { emptyState, skeletonCards } from '../../shared/ui.js';
import { friendlyError } from '../../shared/errors.js';
import { getMatchesByIds, matchPhase } from '../../services/match.service.js';
import { matchCard } from '../components/match-card.js';
import { store, go } from '../app.js';

export default function MyMatchesScreen(el) {
  const d = createDisposer();
  let tab = 'active';
  let matches = null;
  let lastKey = '';

  setHTML(el, html`
    <section class="page">
      <div class="section-head"><h2>My Matches</h2></div>
      <div class="seg-tabs" id="tabs">
        <button type="button" data-tab="active" class="active">Upcoming &amp; Live</button>
        <button type="button" data-tab="done">Completed</button>
      </div>
      <div class="match-list" id="list">${skeletonCards(2)}</div>
    </section>`);

  function render() {
    const box = $('#list', el);
    el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    if (!matches) { setHTML(box, skeletonCards(2)); return; }
    const { entries } = store.get();
    const list = matches.filter((m) => {
      const done = ['completed', 'cancelled'].includes(matchPhase(m));
      return tab === 'done' ? done : !done;
    }).sort((a, b) => (tab === 'done' ? b.startAt.toMillis() - a.startAt.toMillis() : a.startAt.toMillis() - b.startAt.toMillis()));
    if (!list.length) {
      setHTML(box, emptyState({
        iconName: 'trophy',
        title: tab === 'done' ? 'No completed matches yet' : "You haven't joined any match",
        text: tab === 'done' ? 'Your finished matches and winnings will appear here.' : 'Join a tournament and it will show up here with room details.',
        action: tab === 'done' ? '' : '<a class="btn btn-primary" href="#/home">Browse tournaments</a>',
      }));
      return;
    }
    setHTML(box, html`${list.map((m) => matchCard(m, entries.get(m.id)))}`);
  }

  async function load() {
    const ids = [...store.get().entries.keys()];
    const key = ids.join(',');
    if (key === lastKey && matches) { render(); return; }
    lastKey = key;
    try {
      matches = ids.length ? await getMatchesByIds(ids) : [];
      render();
    } catch (e) {
      setHTML($('#list', el), emptyState({ iconName: 'alert', title: 'Could not load', text: friendlyError(e) }));
    }
  }

  d.add(store.subscribe(() => load()));
  d.add(on(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; render(); }));
  d.add(on(el, 'click', '.match-card', (e, card) => { if (!e.target.closest('a,button')) go(card.dataset.href.slice(1)); }));
  return () => d.run();
}
