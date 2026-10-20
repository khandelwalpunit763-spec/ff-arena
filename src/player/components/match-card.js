// Tournament card used on the dashboard and "My Matches".
import { html, raw } from '../../shared/dom.js';
import { countdown } from '../../shared/ui.js';
import { icon } from '../../shared/icons.js';
import { inr, fmtDateTime, shortId, toMillis } from '../../shared/format.js';
import { MATCH_TYPES, slotLabel } from '../../shared/constants.js';
import { matchPhase } from '../../services/match.service.js';

export const mapSlug = (map) => String(map || 'bermuda').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

export function statusChip(m, phase = matchPhase(m)) {
  switch (phase) {
    case 'live': return html`<span class="chip chip-live"><i class="dot"></i>LIVE</span>`;
    case 'open': return html`<span class="chip chip-time">${icon('clock')}${countdown(toMillis(m.startAt), { done: 'Starting' })}</span>`;
    case 'full': return html`<span class="chip chip-full">FULL</span>`;
    case 'closed': return html`<span class="chip chip-time">Starting soon</span>`;
    case 'completed': return html`<span class="chip chip-done">${icon('check')}Completed</span>`;
    case 'cancelled': return html`<span class="chip chip-cancel">Cancelled</span>`;
    default: return '';
  }
}

function cta(m, phase, entry) {
  if (entry) {
    if (phase === 'completed') return html`<a class="btn btn-sm btn-outline" href="#/match/${m.id}">${icon('award')}Results</a>`;
    return html`<a class="btn btn-sm btn-joined" href="#/match/${m.id}">${icon('check')}Joined</a>`;
  }
  if (phase === 'open') return html`<a class="btn btn-sm btn-primary" href="#/join/${m.id}">Join ${m.entryFee ? inr(m.entryFee) : 'Free'}</a>`;
  if (phase === 'full') return html`<span class="btn btn-sm btn-disabled">Full</span>`;
  if (phase === 'completed') return html`<a class="btn btn-sm btn-outline" href="#/match/${m.id}">Results</a>`;
  return html`<a class="btn btn-sm btn-outline" href="#/match/${m.id}">View</a>`;
}

export function matchCard(m, entry = null) {
  const phase = matchPhase(m);
  const pct = Math.min(100, Math.round((m.joinedCount / Math.max(1, m.totalSlots)) * 100));
  const left = Math.max(0, m.totalSlots - m.joinedCount);
  return html`
    <article class="match-card phase-${phase}" data-href="#/match/${m.id}">
      <div class="mc-banner map-${mapSlug(m.map)}">
        <div class="mc-banner-top">
          <span class="chip chip-type">${MATCH_TYPES[m.type]?.label || m.type}</span>
          <span class="chip chip-glass">${icon('map')}${m.map}</span>
          <span class="spacer"></span>
          ${statusChip(m, phase)}
        </div>
        <div class="mc-banner-bottom">
          <h3 class="mc-title">${m.title}</h3>
          <div class="mc-meta">${icon('calendar')}${fmtDateTime(m.startAt)}<span class="sep">•</span>#${shortId(m.id)}</div>
        </div>
      </div>
      <div class="mc-stats">
        <div><span>Prize Pool</span><strong class="text-gold">${inr(m.prizePool)}</strong></div>
        <div><span>Per Kill</span><strong>${inr(m.perKill)}</strong></div>
        <div><span>Entry Fee</span><strong>${m.entryFee ? inr(m.entryFee) : 'FREE'}</strong></div>
      </div>
      <div class="mc-foot">
        <div class="mc-slots">
          <div class="progress"><i style="width:${pct}%"></i></div>
          <small>${phase === 'completed' ? html`${m.joinedCount} played` : html`<b>${m.joinedCount}</b>/${m.totalSlots} joined · ${left} spots left`}</small>
        </div>
        ${cta(m, phase, entry)}
      </div>
      <div class="mc-host">
        ${icon('shield')}<span>Hosted by <b>${m.hostName}</b></span>
        ${entry ? raw(`<span class="mc-myslot">${icon('user')}${slotLabel(m.type, entry.slotNo)}</span>`) : ''}
      </div>
    </article>`;
}
