// JOIN MATCH – pick slot → enter IGN & Player ID → pay entry fee from wallet (atomic transaction)
import { html, setHTML, $, on, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { inr, fmtDateTime, toMillis } from '../../shared/format.js';
import { MATCH_TYPES, ROOM_UNLOCK_MINUTES, slotLabel } from '../../shared/constants.js';
import { splitEntryFee } from '../../shared/prize.js';
import { friendlyError } from '../../shared/errors.js';
import { setBusy, toast, openModal, emptyState, countdown } from '../../shared/ui.js';
import { listenMatch, listenSlots, joinMatch, matchPhase } from '../../services/match.service.js';
import { updateMyProfile } from '../../services/user.service.js';
import { slotGrid } from '../components/slot-grid.js';
import { mapSlug } from '../components/match-card.js';
import { store, go, walletTotal } from '../app.js';

export default function JoinScreen(el, { id }) {
  const d = createDisposer();
  let match;
  let slots = {};
  let selected = null;
  let mounted = false;
  let joining = false;

  setHTML(el, html`<section class="page"><div class="card skeleton-card"><div class="sk sk-banner"></div><div class="sk sk-line"></div></div></section>`);

  function blocked(m) {
    if (store.get().config.maintenance) return { title: 'Under maintenance', text: 'Joining is paused for a short while. Please try again soon.', cta: '<a class="btn btn-primary" href="#/home">Back to home</a>' };
    const entry = store.get().entries.get(id);
    if (entry && !joining) return { title: "You're already in!", text: `You joined this match in ${slotLabel(m.type, entry.slotNo)}.`, cta: `<a class="btn btn-primary" href="#/match/${id}">View match</a>` };
    const phase = matchPhase(m);
    if (phase === 'full') return { title: 'Match is full', text: 'All slots are booked. Try another match.', cta: '<a class="btn btn-primary" href="#/home">Browse matches</a>' };
    if (phase !== 'open') return { title: 'Joining closed', text: 'This match is no longer accepting players.', cta: `<a class="btn btn-primary" href="#/match/${id}">View match</a>` };
    return null;
  }

  function mount() {
    const m = match;
    const { profile } = store.get();
    mounted = true;
    setHTML(el, html`
      <section class="page join with-cta">
        <div class="join-summary map-${mapSlug(m.map)}">
          <div>
            <span class="chip chip-type">${MATCH_TYPES[m.type]?.label}</span>
            <h2>${m.title}</h2>
            <p class="mc-meta">${icon('calendar')}${fmtDateTime(m.startAt)} · ${m.map}</p>
          </div>
          <div class="join-fee"><small>Entry</small><strong>${m.entryFee ? inr(m.entryFee) : 'FREE'}</strong>
            <small class="countdown-line">${countdown(toMillis(m.startAt), { prefix: 'Starts in ', done: 'Started' })}</small></div>
        </div>

        <div class="card">
          <div class="card-head"><h3><span class="step">1</span>Choose your slot</h3><span class="muted small" id="free-count"></span></div>
          <div class="legend">
            <span><i class="seat-dot free"></i>Available</span>
            <span><i class="seat-dot selected"></i>Selected</span>
            <span><i class="seat-dot booked"></i>Booked</span>
          </div>
          <div id="slot-grid"></div>
        </div>

        <form class="card form" id="join-form" novalidate>
          <div class="card-head"><h3><span class="step">2</span>Player details</h3></div>
          <label class="field">
            <span class="field-label">Free Fire In-Game Name (IGN)</span>
            <div class="input-wrap">${icon('gamepad')}<input class="input" name="ign" maxlength="24" placeholder="Exactly as shown in Free Fire" value="${profile?.ign || ''}" required></div>
          </label>
          <label class="field">
            <span class="field-label">Free Fire Player ID (UID)</span>
            <div class="input-wrap">${icon('user')}<input class="input" name="ffUid" inputmode="numeric" maxlength="15" placeholder="e.g. 1234567890" value="${profile?.ffUid || ''}" required></div>
            <small class="hint">Find it in Free Fire → tap your avatar → copy UID.</small>
          </label>
          <label class="check"><input type="checkbox" name="save" checked> <span>Save these details for next time</span></label>
        </form>

        <div class="card pay-card" id="pay-card"></div>

        <div class="sticky-cta">
          <div><small class="muted">Selected</small><b id="sel-label">No slot</b></div>
          <button class="btn btn-primary btn-lg" id="join-btn" type="button">${icon('zap')}<span>${m.entryFee ? `Pay ${inr(m.entryFee)} & Join` : 'Join for FREE'}</span></button>
        </div>
      </section>`);
    const form = $('#join-form', el);
    form.ffUid.addEventListener('input', () => { form.ffUid.value = form.ffUid.value.replace(/\D/g, ''); });
    renderGrid();
    renderPay();
  }

  function renderGrid() {
    const box = $('#slot-grid', el);
    if (!box) return;
    if (selected && slots[selected] && slots[selected].uid !== store.get().user?.uid) {
      toast(`Slot ${selected} was just booked by someone else`, 'warn');
      selected = null;
    }
    setHTML(box, slotGrid({ type: match.type, totalSlots: match.totalSlots, slots, selected, myUid: store.get().user?.uid }));
    const free = match.totalSlots - Object.keys(slots).length;
    $('#free-count', el).textContent = `${free} available`;
    $('#sel-label', el).textContent = selected ? slotLabel(match.type, selected) : 'No slot';
  }

  function renderPay() {
    const box = $('#pay-card', el);
    if (!box) return;
    const { wallet } = store.get();
    const fee = match.entryFee;
    const split = splitEntryFee(wallet, fee);
    const total = walletTotal(wallet);
    setHTML(box, html`
      <div class="card-head"><h3><span class="step">3</span>Payment</h3><span class="muted small">Wallet ${inr(total)}</span></div>
      <div class="kv"><span>Entry fee</span><b>${fee ? inr(fee) : 'FREE'}</b></div>
      ${fee ? html`
        <div class="kv sub"><span>From deposit balance</span><span>${inr(split ? split.fromDeposit : Math.min(fee, wallet?.deposit || 0))}</span></div>
        <div class="kv sub"><span>From winning balance</span><span>${inr(split ? split.fromWinning : 0)}</span></div>
        <div class="kv total"><span>Balance after joining</span><b class="${split ? '' : 'text-red'}">${split ? inr(total - fee) : 'Insufficient'}</b></div>
        ${split ? '' : html`<div class="notice warn">${icon('alert')}<span>You need ${inr(fee - total)} more to join. <a href="#/wallet/add?amount=${Math.max(fee - total, store.get().config.minDeposit)}" class="link">Add money</a></span></div>`}
      ` : html`<p class="muted small">This is a free match – no balance needed.</p>`}
      <p class="hint">${icon('lock')} Room ID &amp; password are shared ${ROOM_UNLOCK_MINUTES} min before start.</p>`);
  }

  function render() {
    if (match === undefined) return;
    if (match === null) {
      setHTML(el, html`<section class="page">${emptyState({ iconName: 'alert', title: 'Match not found' })}</section>`);
      mounted = false;
      return;
    }
    const block = blocked(match);
    if (block) {
      mounted = false;
      setHTML(el, html`<section class="page">${emptyState({ iconName: 'trophy', title: block.title, text: block.text, action: block.cta })}</section>`);
      return;
    }
    if (!mounted) mount();
    else { renderGrid(); renderPay(); }
  }

  async function doJoin() {
    const form = $('#join-form', el);
    const btn = $('#join-btn', el);
    const ign = form.ign.value.trim();
    const ffUid = form.ffUid.value.trim();
    if (!selected) { toast('Select a slot first', 'warn'); $('#slot-grid', el).scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (ign.length < 2) { toast('Enter your Free Fire in-game name', 'warn'); form.ign.focus(); return; }
    if (!/^\d{5,15}$/.test(ffUid)) { toast('Enter a valid Free Fire Player ID (digits only)', 'warn'); form.ffUid.focus(); return; }
    if (match.entryFee && !splitEntryFee(store.get().wallet, match.entryFee)) {
      toast('Insufficient balance – add money first', 'error');
      return;
    }
    joining = true;
    setBusy(btn, true, 'Booking slot…');
    try {
      const res = await joinMatch({ matchId: id, slotNo: selected, ign, ffUid });
      if (form.save.checked) {
        const { user, profile } = store.get();
        if (profile && (profile.ign !== ign || profile.ffUid !== ffUid)) updateMyProfile(user.uid, { ...profile, ign, ffUid }).catch(() => {});
      }
      const { result } = openModal({
        title: "You're in! 🎉",
        body: String(html`
          <div class="success-sheet">
            <div class="success-icon">${icon('check')}</div>
            <p>Slot booked: <b>${slotLabel(match.type, res.slotNo)}</b></p>
            ${res.fee ? html`<p class="muted small">${inr(res.fee)} paid (${inr(res.fromDeposit)} deposit + ${inr(res.fromWinning)} winning)</p>` : ''}
            <p class="muted small">Room ID &amp; password will appear on the match page ${ROOM_UNLOCK_MINUTES} minutes before start.</p>
          </div>`),
        actions: [{ label: 'View match', value: 'view' }],
      });
      await result;
      go(`/match/${id}`, { replace: true });
    } catch (ex) {
      joining = false;
      setBusy(btn, false);
      if (ex.code === 'SLOT_TAKEN') { selected = null; renderGrid(); }
      toast(friendlyError(ex), 'error', 4500);
    }
  }

  d.add(listenMatch(id, (m) => { match = m; render(); }));
  d.add(listenSlots(id, (s) => { slots = s; if (mounted) renderGrid(); }));
  d.add(store.subscribe(() => { if (match !== undefined && !joining) render(); }, { immediate: false }));

  d.add(on(el, 'click', '[data-slot]', (e, btn) => {
    const n = Number(btn.dataset.slot);
    if (slots[n]) return;
    selected = selected === n ? null : n;
    renderGrid();
  }));
  d.add(on(el, 'click', '#join-btn', () => doJoin()));

  return () => d.run();
}
