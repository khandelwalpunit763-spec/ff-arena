import { html } from '../../shared/dom.js';
import { countdown } from '../../shared/ui.js';
import { icon } from '../../shared/icons.js';
import { toMillis } from '../../shared/format.js';

export function statusBadge(m) {
  switch (m.status) {
    case 'live': return html`<span class="chip chip-live"><i class="dot"></i>Live</span>`;
    case 'completed': return html`<span class="chip chip-done">${icon('check')}Completed</span>`;
    case 'cancelled': return html`<span class="chip chip-cancel">Cancelled</span>`;
    default:
      return toMillis(m.startAt) <= Date.now()
        ? html`<span class="chip chip-time">Start pending</span>`
        : html`<span class="chip chip-time">${icon('clock')}${countdown(toMillis(m.startAt), { done: 'Starting' })}</span>`;
  }
}
