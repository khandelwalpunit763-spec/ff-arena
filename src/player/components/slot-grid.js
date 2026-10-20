// Slot picker: numbered seats for Solo, team rows (A/B/C/D) for Duo & Squad.
import { html } from '../../shared/dom.js';
import { teamSize } from '../../shared/constants.js';

function seat(n, slots, selected, myUid, label) {
  const s = slots[n];
  const state = s ? (s.uid === myUid ? 'mine' : 'booked') : (selected === n ? 'selected' : 'free');
  const title = s ? `Booked by ${s.ign}` : `Slot ${n}`;
  return html`<button type="button" class="seat seat-${state}" data-slot="${n}" ${s ? 'disabled' : ''} title="${title}" aria-pressed="${selected === n}">
      <span class="seat-no">${label || n}</span>
      ${s ? html`<span class="seat-ign">${s.ign}</span>` : ''}
    </button>`;
}

export function slotGrid({ type, totalSlots, slots, selected, myUid }) {
  const size = teamSize(type);
  if (size === 1) {
    return html`<div class="seat-grid solo">${Array.from({ length: totalSlots }, (_, i) => seat(i + 1, slots, selected, myUid))}</div>`;
  }
  const teams = Math.ceil(totalSlots / size);
  return html`<div class="team-list">
    ${Array.from({ length: teams }, (_, t) => {
      const seats = Array.from({ length: size }, (_, p) => t * size + p + 1);
      const filled = seats.filter((n) => slots[n]).length;
      return html`<div class="team-row">
        <div class="team-name"><b>Team ${t + 1}</b><small>${filled}/${size}</small></div>
        <div class="team-seats size-${size}">${seats.map((n, p) => seat(n, slots, selected, myUid, String.fromCharCode(65 + p)))}</div>
      </div>`;
    })}
  </div>`;
}
