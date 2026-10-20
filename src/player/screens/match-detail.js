// MATCH DETAILS – info, prize table, room details (joined players only), players, results.
import { html, setHTML, $, on, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { inr, fmtDateTime, fmtTime, toMillis, shortId } from '../../shared/format.js';
import { MATCH_TYPES, ROOM_UNLOCK_MINUTES, slotLabel, teamSize } from '../../shared/constants.js';
import { rankPrizeList } from '../../shared/prize.js';
import { copyText, emptyState, countdown } from '../../shared/ui.js';
import { listenMatch, listenPlayers, listenResults, listenRoom, matchPhase } from '../../services/match.service.js';
import { mapSlug, statusChip } from '../components/match-card.js';
import { store, go } from '../app.js';

export default function MatchDetailScreen(el, { id }) {
  const d = createDisposer();
  let match;
  let players = [];
  let results = [];
  let room = null;
  let roomUnsub = null;

  setHTML(el, html`<section class="page match-detail"><div class="card skeleton-card"><div class="sk sk-banner"></div><div class="sk sk-line"></div></div></section>`);

  const myUid = () => store.get().user?.uid;
  const myEntry = () => store.get().entries.get(id);

  function syncRoomListener() {
    if (myEntry() && !roomUnsub) {
      roomUnsub = listenRoom(id, (r) => { room = r; render(); });
      d.add(() => roomUnsub && roomUnsub());
    }
  }

  function roomCard(phase) {
    const entry = myEntry();
    if (phase === 'completed' || phase === 'cancelled') return '';
    if (!entry) {
      return html`<div class="card room-card locked">${icon('lock')}<div><b>Room ID &amp; Password</b><p class="muted small">Join this match to receive the custom room details.</p></div></div>`;
    }
    if (room?.roomId) {
      return html`
        <div class="card room-card ready">
          <div class="room-head">${icon('key')}<b>Custom Room Details</b><span class="chip chip-live small"><i class="dot"></i>Published</span></div>
          <div class="room-grid">
            <div class="room-field"><span>Room ID</span><strong>${room.roomId}</strong><button class="icon-btn" data-copy="${room.roomId}" data-copy-label="Room ID">${icon('copy')}</button></div>
            <div class="room-field"><span>Password</span><strong>${room.roomPass || '—'}</strong><button class="icon-btn" data-copy="${room.roomPass}" data-copy-label="Password">${icon('copy')}</button></div>
          </div>
          <p class="muted small">Join the room with your registered IGN <b>${entry.ign}</b> in <b>${slotLabel(match.type, entry.slotNo)}</b>. Don't share these details.</p>
        </div>`;
    }
    const unlockAt = toMillis(match.startAt) - ROOM_UNLOCK_MINUTES * 60000;
    return html`
      <div class="card room-card waiting">
        ${icon('clock')}
        <div>
          <b>Room details coming soon</b>
          <p class="muted small">The host will publish Room ID &amp; Password at <b>${fmtTime(unlockAt)}</b> (${ROOM_UNLOCK_MINUTES} min before start).</p>
          <p class="countdown-line">${countdown(unlockAt, { prefix: 'Unlocks in ', done: 'Any moment now…' })}</p>
        </div>
      </div>`;
  }

  function resultsSection() {
    if (!results.length) return '';
    const me = myUid();
    const sorted = [...results].sort((a, b) => a.rank - b.rank || b.kills - a.kills);
    return html`
      <div class="card">
        <div class="card-head"><h3>${icon('trophy')} Results</h3><span class="muted small">${results.length} players</span></div>
        <div class="table results-table">
          <div class="tr th"><span>#</span><span>Player</span><span>Kills</span><span>Won</span></div>
          ${sorted.map((r) => html`
            <div class="tr ${r.uid === me ? 'me' : ''} ${r.rank <= 3 ? `top top-${r.rank}` : ''}">
              <span class="rank-badge">${r.rank}</span>
              <span class="ellipsis">${r.ign}${r.uid === me ? html` <em class="you">YOU</em>` : ''}</span>
              <span>${r.kills}</span>
              <span class="${r.amount ? 'text-green' : 'muted'}">${r.amount ? inr(r.amount) : '—'}</span>
            </div>`)}
        </div>
      </div>`;
  }

  function stickyCta(phase) {
    const entry = myEntry();
    if (entry) {
      return html`<div class="sticky-cta"><div><small class="muted">Your slot</small><b>${slotLabel(match.type, entry.slotNo)}</b></div><span class="btn btn-joined">${icon('check')}Joined</span></div>`;
    }
    if (phase === 'open') {
      return html`<div class="sticky-cta"><div><small class="muted">Entry fee</small><b>${match.entryFee ? inr(match.entryFee) : 'FREE'}</b></div><a class="btn btn-primary btn-lg" href="#/join/${match.id}">${icon('zap')}Join Match</a></div>`;
    }
    const label = { full: 'Match full', closed: 'Joining closed', live: 'Match is live', completed: 'Match completed', cancelled: 'Match cancelled' }[phase];
    return html`<div class="sticky-cta"><span class="muted">${label}</span></div>`;
  }

  function render() {
    if (match === undefined) return;
    if (match === null) {
      setHTML(el, html`<section class="page">${emptyState({ iconName: 'alert', title: 'Match not found', text: 'It may have been removed by the host.', action: '<a class="btn btn-primary" href="#/home">Back to matches</a>' })}</section>`);
      return;
    }
    const m = match;
    const phase = matchPhase(m);
    const prizes = rankPrizeList(m.rankPrizes);
    const size = teamSize(m.type);
    const me = myUid();

    setHTML(el, html`
      <section class="page match-detail with-cta">
        <div class="detail-banner map-${mapSlug(m.map)}">
          <div class="mc-banner-top">
            <span class="chip chip-type">${MATCH_TYPES[m.type]?.label}</span>
            <span class="chip chip-glass">${icon('map')}${m.map}</span>
            <span class="spacer"></span>
            ${statusChip(m, phase)}
          </div>
          <div class="detail-banner-bottom">
            <h2>${m.title}</h2>
            <div class="mc-meta">${icon('calendar')}${fmtDateTime(m.startAt)}<span class="sep">•</span>Match #${shortId(m.id)}</div>
          </div>
        </div>

        <div class="stat-tiles">
          <div class="tile"><span>Prize Pool</span><strong class="text-gold">${inr(m.prizePool)}</strong></div>
          <div class="tile"><span>Per Kill</span><strong>${inr(m.perKill)}</strong></div>
          <div class="tile"><span>Entry</span><strong>${m.entryFee ? inr(m.entryFee) : 'FREE'}</strong></div>
          <div class="tile"><span>Slots</span><strong>${m.joinedCount}/${m.totalSlots}</strong></div>
        </div>

        ${roomCard(phase)}

        ${myEntry() ? html`
          <div class="card my-entry">
            <div class="card-head"><h3>${icon('user')} Your entry</h3><span class="chip chip-done small">${icon('check')}Confirmed</span></div>
            <div class="kv"><span>Slot</span><b>${slotLabel(m.type, myEntry().slotNo)}</b></div>
            <div class="kv"><span>In-game name</span><b>${myEntry().ign}</b></div>
            <div class="kv"><span>FF Player ID</span><b>${myEntry().ffUid}</b></div>
            <div class="kv"><span>Paid</span><b>${inr((myEntry().fromDeposit || 0) + (myEntry().fromWinning || 0))}</b></div>
          </div>` : ''}

        ${resultsSection()}

        <div class="card">
          <div class="card-head"><h3>${icon('award')} Prize distribution</h3>${size > 1 ? html`<span class="muted small">per player · team of ${size}</span>` : ''}</div>
          ${prizes.length ? html`
            <div class="prize-list">
              ${prizes.map(([rank, prize]) => html`<div class="prize-row rank-${rank}"><span class="rank-badge">#${rank}</span><span>${rank === 1 ? 'Booyah! Winner' : `Rank ${rank}`}</span><b>${inr(prize)}</b></div>`)}
            </div>` : html`<p class="muted small">No rank prizes – kill rewards only.</p>`}
          <div class="prize-row kill"><span class="rank-badge">${icon('crosshair')}</span><span>Every kill</span><b>${inr(m.perKill)}</b></div>
        </div>

        <div class="card">
          <div class="card-head"><h3>${icon('info')} Match info</h3></div>
          <div class="kv"><span>Date &amp; time</span><b>${fmtDateTime(m.startAt)}</b></div>
          <div class="kv"><span>Mode</span><b>${MATCH_TYPES[m.type]?.label} · ${m.map}</b></div>
          <div class="kv"><span>Hosted by</span><b>${m.hostName}</b></div>
          ${m.description ? html`<div class="rules-text">${m.description}</div>` : ''}
        </div>

        <div class="card">
          <div class="card-head"><h3>${icon('users')} Joined players</h3><span class="muted small">${players.length}/${m.totalSlots}</span></div>
          ${players.length ? html`
            <div class="player-chips">
              ${players.map((p) => html`<div class="player-chip ${p.uid === me ? 'me' : ''}"><span class="slot-no">${size > 1 ? slotLabel(m.type, p.slotNo).replace('Team ', 'T').replace(' · ', '') : p.slotNo}</span><span class="ellipsis">${p.ign}</span></div>`)}
            </div>` : html`<p class="muted small">Be the first to join!</p>`}
        </div>
        ${stickyCta(phase)}
      </section>`);
  }

  d.add(listenMatch(id, (m) => { match = m; render(); }));
  d.add(listenPlayers(id, (p) => { players = p; render(); }));
  d.add(listenResults(id, (r) => { results = r; render(); }));
  d.add(store.subscribe(() => { syncRoomListener(); render(); }));

  d.add(on(el, 'click', '[data-copy]', (e, btn) => copyText(btn.dataset.copy, btn.dataset.copyLabel || 'Copied')));
  d.add(on(el, 'click', '.sticky-cta a', (e, a) => { e.preventDefault(); go(a.getAttribute('href').slice(1)); }));

  return () => d.run();
}
