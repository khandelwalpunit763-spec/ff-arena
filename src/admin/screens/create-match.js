// CREATE / EDIT MATCH – all fields + rank-prize builder + live preview + economics helper.
import { html, raw, setHTML, $, on, readForm, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { inr, toLocalInputValue } from '../../shared/format.js';
import { MAPS, MATCH_TYPES, SLOT_PRESETS, MAX_RANK_PRIZES, teamSize } from '../../shared/constants.js';
import { rankPoolNeeded } from '../../shared/prize.js';
import { friendlyError } from '../../shared/errors.js';
import { setBusy, toast } from '../../shared/ui.js';
import { createMatch, updateMatchDetails } from '../../services/admin/admin-match.service.js';
import { getMatch } from '../../services/match.service.js';
import { matchCard } from '../../player/components/match-card.js';
import { store, go } from '../app.js';

const DEFAULT_RULES = '• Join the custom room with your registered IGN only.\n• Emulator / PC players are not allowed.\n• Teaming, hacking or glitching = ban without refund.\n• Room ID & password are shared 15 minutes before start.\n• Results are published within 30 minutes after the match.';

function defaultStart() {
  const d = new Date(Date.now() + 2 * 3600 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}

export default function CreateMatchScreen(el, params) {
  const d = createDisposer();
  const editId = params.id || null;
  let original = null;
  let state = {
    title: '', type: 'solo', map: 'Bermuda', startAt: toLocalInputValue(defaultStart()), totalSlots: 48,
    entryFee: 20, perKill: 5, prizePool: 400, rankPrizes: [200, 120, 80], description: DEFAULT_RULES,
  };

  function moneyLocked() { return Boolean(original && original.joinedCount > 0); }

  function render() {
    const lock = moneyLocked();
    const lim = store.get().config.limits;
    setHTML(el, html`
      <div class="create-layout">
        <form class="card form" id="match-form" novalidate>
          ${editId ? html`<div class="notice ${lock ? 'warn' : ''}">${icon('info')}<span>${lock ? `${original.joinedCount} players already joined – entry fee, prizes, type and slots are locked for fairness.` : 'Editing an upcoming match.'}</span></div>` : ''}
          <div class="form-section">${icon('gamepad')} Match details</div>
          <label class="field"><span class="field-label">Match title</span>
            <input class="input" name="title" maxlength="80" placeholder="e.g. Bermuda Solo Showdown #102" value="${state.title}" required></label>
          <div class="grid-2">
            <label class="field"><span class="field-label">Date &amp; time</span>
              <input class="input" type="datetime-local" name="startAt" value="${state.startAt}" required></label>
            <label class="field"><span class="field-label">Map</span>
              <select class="input" name="map">${MAPS.map((m) => html`<option ${m === state.map ? raw('selected') : ''}>${m}</option>`)}</select></label>
          </div>
          <div class="field"><span class="field-label">Match type</span>
            <div class="seg-radio">${Object.entries(MATCH_TYPES).map(([id, t]) => html`
              <label class="${state.type === id ? 'active' : ''} ${lock ? 'disabled' : ''}"><input type="radio" name="type" value="${id}" ${state.type === id ? raw('checked') : ''} ${lock ? raw('disabled') : ''}>${t.label}<small>${t.teamSize} / team</small></label>`)}
            </div></div>
          <div class="field"><span class="field-label">Total slots <em>(multiple of ${teamSize(state.type)})</em></span>
            <div class="slots-row">
              <input class="input" type="number" name="totalSlots" min="2" max="100" value="${state.totalSlots}" ${lock ? raw('disabled') : ''}>
              ${SLOT_PRESETS.filter((n) => n % teamSize(state.type) === 0).map((n) => html`<button type="button" class="amount-chip ${Number(state.totalSlots) === n ? 'active' : ''}" data-slots="${n}" ${lock ? raw('disabled') : ''}>${n}</button>`)}
            </div></div>

          <div class="form-section">${icon('coins')} Money</div>
          <div class="grid-3">
            <label class="field"><span class="field-label">Entry fee (₹)</span><input class="input" type="number" min="0" max="${lim.maxEntryFee}" name="entryFee" value="${state.entryFee}" ${lock ? raw('disabled') : ''}></label>
            <label class="field"><span class="field-label">Per kill (₹)</span><input class="input" type="number" min="0" max="${lim.maxPerKill}" name="perKill" value="${state.perKill}" ${lock ? raw('disabled') : ''}></label>
            <label class="field"><span class="field-label">Prize pool (₹)</span><input class="input" type="number" min="0" max="${lim.maxPrizePool}" name="prizePool" value="${state.prizePool}" ${lock ? raw('disabled') : ''}></label>
          </div>
          <div class="field">
            <span class="field-label">Rank prizes <em>(per player – in Duo/Squad every team member gets this)</em></span>
            <div class="rank-rows" id="rank-rows">
              ${state.rankPrizes.map((p, i) => html`
                <div class="rank-row"><span class="rank-badge">#${i + 1}</span>
                  <input class="input" type="number" min="0" data-rank="${i}" value="${p}" ${lock ? raw('disabled') : ''}>
                  <button type="button" class="icon-btn" data-remove-rank="${i}" ${lock ? raw('disabled') : ''} aria-label="Remove">${icon('x')}</button></div>`)}
            </div>
            <div class="row-gap">
              <button type="button" class="btn btn-ghost btn-sm" id="add-rank" ${lock || state.rankPrizes.length >= MAX_RANK_PRIZES ? raw('disabled') : ''}>${icon('plus')}<span>Add rank</span></button>
              <button type="button" class="btn btn-ghost btn-sm" id="auto-split" ${lock ? raw('disabled') : ''}>${icon('zap')}<span>Auto split 50/30/20</span></button>
            </div>
            <div id="pool-check"></div>
          </div>

          <div class="form-section">${icon('list')} Rules / description</div>
          <textarea class="input" name="description" rows="5" maxlength="1500">${state.description}</textarea>
          <p class="form-error" id="cm-error"></p>
          <div class="row-gap end">
            ${editId ? html`<a class="btn btn-ghost" href="#/match/${editId}">Cancel</a>` : ''}
            <button class="btn btn-primary btn-lg" id="cm-submit">${icon(editId ? 'check' : 'plus')}<span>${editId ? 'Save changes' : 'Create match'}</span></button>
          </div>
        </form>
        <aside class="preview-col">
          <div class="section-title">Live preview (player app)</div>
          <div id="preview"></div>
          <div class="card" id="economics"></div>
        </aside>
      </div>`);
    renderDerived();
  }

  function collect() {
    const form = $('#match-form', el);
    if (!form) return;
    const v = readForm(form);
    state = {
      ...state,
      ...v,
      type: form.querySelector('input[name=type]:checked')?.value || state.type,
      rankPrizes: Array.from(el.querySelectorAll('[data-rank]')).map((i) => Number(i.value) || 0),
    };
    if (moneyLocked()) Object.assign(state, {
      type: original.type, totalSlots: original.totalSlots, entryFee: original.entryFee, perKill: original.perKill, prizePool: original.prizePool,
    });
  }

  function renderDerived() {
    const rp = {};
    state.rankPrizes.forEach((p, i) => { if (Number(p) > 0) rp[i + 1] = Number(p); });
    const needed = rankPoolNeeded(rp, state.type);
    const pool = Number(state.prizePool) || 0;
    const size = teamSize(state.type);
    setHTML($('#pool-check', el), html`
      <div class="pool-check ${needed > pool ? 'bad' : needed < pool ? 'warn' : 'ok'}">
        ${icon(needed > pool ? 'alert' : 'check')}
        <span>Rank prizes need <b>${inr(needed)}</b>${size > 1 ? ` (× ${size} players per team)` : ''} of the <b>${inr(pool)}</b> prize pool.
        ${needed > pool ? ' Increase the prize pool or reduce rank prizes – payouts are hard-capped at the prize pool.' : needed < pool ? ` ${inr(pool - needed)} will remain undistributed.` : ''}</span>
      </div>`);

    const start = new Date(state.startAt);
    const fake = {
      id: editId || 'NEW', title: state.title || 'Your match title', type: state.type, map: state.map,
      startAt: { toMillis: () => start.getTime(), toDate: () => start },
      entryFee: Number(state.entryFee) || 0, perKill: Number(state.perKill) || 0, prizePool: pool,
      totalSlots: Number(state.totalSlots) || 0, joinedCount: original?.joinedCount || 0,
      hostName: original?.hostName || store.get().staff.name, status: 'upcoming',
    };
    setHTML($('#preview', el), matchCard(fake));

    const slots = Number(state.totalSlots) || 0;
    const fees = slots * (Number(state.entryFee) || 0);
    const maxPayout = pool + (Number(state.perKill) || 0) * Math.max(0, slots - 1);
    setHTML($('#economics', el), html`
      <div class="card-head"><h3>${icon('rupee')} Economics (full lobby)</h3></div>
      <div class="kv"><span>Entry collection</span><b>${inr(fees)}</b></div>
      <div class="kv"><span>Max payout (prizes + all kills)</span><b>${inr(maxPayout)}</b></div>
      <div class="kv total"><span>Worst-case margin</span><b class="${fees - maxPayout >= 0 ? 'text-green' : 'text-red'}">${inr(fees - maxPayout)}</b></div>
      <p class="hint">Kill bonus is capped server-side at (joined players) kills per match.</p>`);
  }

  async function submit(e) {
    e.preventDefault();
    collect();
    const err = $('#cm-error', el);
    err.textContent = '';
    const btn = $('#cm-submit', el);
    setBusy(btn, true, editId ? 'Saving…' : 'Creating…');
    try {
      if (editId) {
        await updateMatchDetails(editId, state, { moneyLocked: moneyLocked() });
        toast('Match updated', 'success');
        go(`/match/${editId}`);
      } else {
        const id = await createMatch(state, { uid: store.get().user.uid, name: store.get().staff.name });
        toast('Match created & live in the player app 🚀', 'success');
        go(`/match/${id}`);
      }
    } catch (ex) {
      err.textContent = friendlyError(ex);
      setBusy(btn, false);
    }
  }

  d.add(on(el, 'input', '#match-form', () => { collect(); renderDerived(); }));
  d.add(on(el, 'change', 'input[name=type]', () => {
    collect();
    const size = teamSize(state.type);
    if (Number(state.totalSlots) % size !== 0) state.totalSlots = 48;
    render();
  }));
  d.add(on(el, 'click', '[data-slots]', (e, b) => { collect(); state.totalSlots = Number(b.dataset.slots); render(); }));
  d.add(on(el, 'click', '#add-rank', () => { collect(); state.rankPrizes = [...state.rankPrizes, 0]; render(); }));
  d.add(on(el, 'click', '[data-remove-rank]', (e, b) => { collect(); state.rankPrizes = state.rankPrizes.filter((_, i) => i !== Number(b.dataset.removeRank)); render(); }));
  d.add(on(el, 'click', '#auto-split', () => {
    collect();
    const per = (Number(state.prizePool) || 0) / teamSize(state.type);
    state.rankPrizes = [Math.floor(per * 0.5), Math.floor(per * 0.3), Math.floor(per * 0.2)];
    render();
  }));
  d.add(on(el, 'submit', '#match-form', submit));

  if (editId) {
    setHTML(el, html`<div class="card"><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>`);
    getMatch(editId).then((m) => {
      if (!m) { setHTML(el, html`<div class="card">Match not found.</div>`); return; }
      original = m;
      const ranks = Object.entries(m.rankPrizes || {}).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, v]) => v);
      state = {
        title: m.title, type: m.type, map: m.map, startAt: toLocalInputValue(m.startAt), totalSlots: m.totalSlots,
        entryFee: m.entryFee, perKill: m.perKill, prizePool: m.prizePool, rankPrizes: ranks.length ? ranks : [0], description: m.description || '',
      };
      render();
    });
  } else render();

  return () => d.run();
}
