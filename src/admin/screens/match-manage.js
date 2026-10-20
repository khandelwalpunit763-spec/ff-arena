// MANAGE ONE MATCH – status, Room ID/Password (15-min rule), players, result upload & payouts.
import { html, raw, setHTML, $, on, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { inr, fmtDateTime, fmtTime, toMillis, shortId, timeAgo } from '../../shared/format.js';
import { MATCH_TYPES, ROOM_UNLOCK_MINUTES, slotLabel, teamSize } from '../../shared/constants.js';
import { calcWinnings, validateResultSheet, rankPrizeList } from '../../shared/prize.js';
import { friendlyError } from '../../shared/errors.js';
import { setBusy, toast, confirmDialog, openModal, copyText, emptyState, countdown } from '../../shared/ui.js';
import { listenMatch, listenPlayers, listenResults, listenRoom } from '../../services/match.service.js';
import { setMatchStatus, publishRoom, cancelMatchAndRefund, deleteMatch } from '../../services/admin/admin-match.service.js';
import { publishResults } from '../../services/admin/result.service.js';
import { statusBadge } from '../components/badges.js';
import { isSuper, me, go } from '../app.js';

function progressModal(title) {
  const m = openModal({ title, dismissible: false, body: '<div class="progress big"><i id="pm-bar" style="width:0%"></i></div><p class="muted center" id="pm-text">Starting…</p>' });
  return {
    update(done, total, label) {
      const bar = m.el.querySelector('#pm-bar');
      const text = m.el.querySelector('#pm-text');
      if (bar) bar.style.width = `${Math.round((done / Math.max(total, 1)) * 100)}%`;
      if (text) text.textContent = `${label} ${done}/${total}`;
    },
    close: () => m.close(),
  };
}

export default function MatchManageScreen(el, { id }) {
  const d = createDisposer();
  let match;
  let players = [];
  let results = [];
  let room = null;
  const sheet = {};            // uid → { kills, rank } (unsaved result inputs)
  let unlockTimer = null;

  setHTML(el, html`<div class="card"><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>`);

  const canManage = () => match && (isSuper() || match.hostId === me().uid);
  const unlockAt = () => toMillis(match.startAt) - ROOM_UNLOCK_MINUTES * 60000;

  function layout() {
    setHTML(el, html`
      <div class="manage">
        <div class="card manage-head" id="head"></div>
        <div class="manage-grid">
          <div class="manage-main">
            <div class="card" id="results-card"></div>
            <div class="card" id="players-card"></div>
          </div>
          <div class="manage-side">
            <div class="card" id="room-card"></div>
            <div class="card" id="prize-card"></div>
          </div>
        </div>
      </div>`);
  }

  function renderHead() {
    const m = match;
    const net = (m.collected || 0) - (m.distributed || 0) - (m.refunded || 0);
    const started = Date.now() >= unlockAt();
    setHTML($('#head', el), html`
      <div class="mh-top">
        <div>
          <div class="mh-chips">${statusBadge(m)}<span class="chip chip-type">${MATCH_TYPES[m.type]?.label}</span><span class="chip">${icon('map')}${m.map}</span><span class="chip chip-staff">${icon('shield')}${m.hostName}</span></div>
          <h2>${m.title}</h2>
          <p class="muted">#${shortId(m.id)} · ${fmtDateTime(m.startAt)} ${m.status === 'upcoming' ? html`· ${countdown(toMillis(m.startAt), { prefix: 'starts in ', done: 'start time reached' })}` : ''}</p>
        </div>
        ${canManage() ? html`<div class="mh-actions">
          ${m.status === 'upcoming' ? html`<button class="btn btn-success" id="go-live" ${started ? '' : raw(`disabled title="Available from ${fmtTime(unlockAt())}"`)}>${icon('play')}<span>Go live</span></button>` : ''}
          ${m.status === 'upcoming' ? html`<a class="btn btn-ghost" href="#/edit/${m.id}">${icon('edit')}<span>Edit</span></a>` : ''}
          ${['upcoming', 'live'].includes(m.status) && !m.distributed && !m.resultsCount ? html`<button class="btn btn-danger" id="cancel-match">${icon('ban')}<span>Cancel &amp; refund</span></button>` : ''}
          ${m.status === 'cancelled' && (m.refundedCount || 0) < m.joinedCount ? html`<button class="btn btn-danger" id="resume-refund">${icon('refresh')}<span>Resume refunds</span></button>` : ''}
          ${m.joinedCount === 0 ? html`<button class="btn btn-ghost" id="delete-match">${icon('trash')}</button>` : ''}
        </div>` : html`<span class="chip chip-cancel">Read-only · hosted by ${m.hostName}</span>`}
      </div>
      <div class="kpis">
        <div><span>Joined</span><b>${m.joinedCount}/${m.totalSlots}</b></div>
        <div><span>Collected</span><b class="text-gold">${inr(m.collected)}</b></div>
        <div><span>Distributed</span><b>${inr(m.distributed)}</b></div>
        <div><span>Refunded</span><b>${inr(m.refunded)}</b></div>
        <div><span>Net</span><b class="${net >= 0 ? 'text-green' : 'text-red'}">${inr(net)}</b></div>
      </div>`);
  }

  function renderRoom() {
    const box = $('#room-card', el);
    const m = match;
    const locked = Date.now() < unlockAt();
    const closed = ['completed', 'cancelled'].includes(m.status);
    clearTimeout(unlockTimer);
    if (locked) unlockTimer = setTimeout(() => { renderRoom(); renderHead(); }, unlockAt() - Date.now() + 500);
    setHTML(box, html`
      <div class="card-head"><h3>${icon('key')} Room ID &amp; Password</h3>${m.roomPublishedAt ? html`<span class="chip chip-done small">Published ${timeAgo(m.roomPublishedAt)}</span>` : ''}</div>
      ${locked ? html`<div class="notice">${icon('lock')}<span>Unlocks at <b>${fmtTime(unlockAt())}</b> (${ROOM_UNLOCK_MINUTES} min before start) · <b>${countdown(unlockAt(), { done: 'unlocked' })}</b></span></div>` : ''}
      <form class="form" id="room-form">
        <div class="grid-2">
          <label class="field"><span class="field-label">Room ID</span><input class="input mono" name="roomId" maxlength="30" value="${room?.roomId || ''}" ${locked || closed || !canManage() ? raw('disabled') : ''} required></label>
          <label class="field"><span class="field-label">Password</span><input class="input mono" name="roomPass" maxlength="30" value="${room?.roomPass || ''}" ${locked || closed || !canManage() ? raw('disabled') : ''}></label>
        </div>
        ${canManage() && !closed ? html`<button class="btn btn-primary btn-block" id="room-save" ${locked ? raw('disabled') : ''}>${icon('send')}<span>${room ? 'Update & notify players' : 'Publish to joined players'}</span></button>` : ''}
        <p class="hint">${icon('shield')} Only players who joined this match can read these details (enforced by security rules).</p>
      </form>`);
  }

  function renderPrize() {
    const m = match;
    const list = rankPrizeList(m.rankPrizes);
    setHTML($('#prize-card', el), html`
      <div class="card-head"><h3>${icon('award')} Prize formula</h3></div>
      <div class="formula">winnings = kills × ${inr(m.perKill)} + rank prize</div>
      ${list.map(([r, p]) => html`<div class="kv"><span>Rank #${r}${teamSize(m.type) > 1 ? ' (per player)' : ''}</span><b>${inr(p)}</b></div>`)}
      <div class="kv"><span>Prize pool cap</span><b>${inr(m.prizePool)}</b></div>
      <div class="kv"><span>Rank prizes paid</span><b>${inr(m.rankPaid)}</b></div>
      <div class="kv"><span>Kills paid</span><b>${m.killsPaid} × ${inr(m.perKill)}</b></div>`);
  }

  function renderPlayers() {
    const m = match;
    setHTML($('#players-card', el), html`
      <div class="card-head"><h3>${icon('users')} Joined players <span class="muted small">(${players.length}/${m.totalSlots})</span></h3>
        ${players.length ? html`<div class="row-gap"><button class="btn btn-ghost btn-sm" id="copy-list">${icon('copy')}<span>Copy list</span></button><button class="btn btn-ghost btn-sm" id="csv">${icon('arrowDown')}<span>CSV</span></button></div>` : ''}</div>
      ${players.length ? html`<div class="dtable-wrap"><table class="dtable">
        <thead><tr><th>Slot</th><th>IGN</th><th>FF Player ID</th><th>Paid</th><th>Joined</th></tr></thead>
        <tbody>${players.map((p) => html`<tr>
          <td><span class="slot-no">${teamSize(m.type) > 1 ? slotLabel(m.type, p.slotNo).replace('Team ', 'T') : p.slotNo}</span></td>
          <td><b>${p.ign}</b></td>
          <td><button class="copy-cell" data-copy="${p.ffUid}">${p.ffUid} ${icon('copy')}</button></td>
          <td>${inr(p.fromDeposit + p.fromWinning)}</td>
          <td class="muted">${timeAgo(p.joinedAt)}</td>
        </tr>`)}</tbody></table></div>` : emptyState({ iconName: 'users', title: 'No players yet', text: 'Share the match – it is already visible in the player app.' })}`);
  }

  function rowsForSheet() {
    return players.map((p) => ({ uid: p.uid, ign: p.ign, slotNo: p.slotNo, kills: sheet[p.uid]?.kills ?? '', rank: sheet[p.uid]?.rank ?? '' }));
  }

  function renderResultSummary() {
    const box = $('#result-summary', el);
    if (!box) return;
    const done = new Set(results.map((r) => r.uid));
    const pending = rowsForSheet().filter((r) => !done.has(r.uid));
    const filled = pending.filter((r) => r.rank !== '' && Number(r.rank) > 0);
    const errors = pending.length ? validateResultSheet(match, pending.map((r) => ({ ...r, kills: Number(r.kills) || 0, rank: Number(r.rank) || 0 }))) : [];
    const total = pending.reduce((a, r) => a + calcWinnings(match, r).amount, 0);
    setHTML(box, html`
      <div class="sum-grid">
        <div><span>Ranks filled</span><b>${filled.length}/${pending.length}</b></div>
        <div><span>To distribute</span><b class="text-gold">${inr(total)}</b></div>
        <div><span>Already credited</span><b>${results.length}</b></div>
      </div>
      ${errors.length ? html`<div class="notice danger">${icon('alert')}<span>${errors.slice(0, 4).join(' • ')}</span></div>` : ''}
      <button class="btn btn-primary btn-lg btn-block" id="publish" ${errors.length || !pending.length ? raw('disabled') : ''}>${icon('trophy')}<span>Publish results &amp; credit ${inr(total)}</span></button>`);
    pending.forEach((r) => {
      const cell = el.querySelector(`[data-win="${r.uid}"]`);
      if (cell) cell.textContent = inr(calcWinnings(match, r).amount);
    });
  }

  function renderResults() {
    const m = match;
    const box = $('#results-card', el);
    const started = Date.now() >= toMillis(m.startAt) || m.status === 'live';
    if (m.status === 'cancelled') { setHTML(box, html`<div class="notice">${icon('info')}<span>Match cancelled · ${m.refundedCount || 0}/${m.joinedCount} players refunded (${inr(m.refunded)}).</span></div>`); return; }
    if (!players.length) { setHTML(box, html`<div class="card-head"><h3>${icon('trophy')} Results</h3></div><p class="muted small">Results can be uploaded once players have joined and the match is played.</p>`); return; }
    if (m.status === 'upcoming' && !started) {
      setHTML(box, html`<div class="card-head"><h3>${icon('trophy')} Result upload</h3></div><div class="notice">${icon('clock')}<span>Result upload opens after the match starts (${fmtDateTime(m.startAt)}).</span></div>`);
      return;
    }
    const done = new Map(results.map((r) => [r.uid, r]));
    const editable = canManage() && m.status !== 'completed';
    setHTML(box, html`
      <div class="card-head"><h3>${icon('trophy')} ${m.status === 'completed' ? 'Final results' : 'Upload results'}</h3>
        ${editable ? html`<span class="muted small">Enter kills &amp; survival rank for every player</span>` : ''}</div>
      <div class="dtable-wrap"><table class="dtable results-input">
        <thead><tr><th>Slot</th><th>Player</th><th>Kills</th><th>Rank</th><th>Winnings</th></tr></thead>
        <tbody>${players.map((p) => {
          const r = done.get(p.uid);
          if (r) return html`<tr class="credited"><td><span class="slot-no">${p.slotNo}</span></td><td><b>${p.ign}</b></td><td>${r.kills}</td><td>#${r.rank}</td><td class="text-green"><b>${inr(r.amount)}</b> ${icon('check')}</td></tr>`;
          return html`<tr><td><span class="slot-no">${p.slotNo}</span></td><td><b>${p.ign}</b><br><small class="muted">${p.ffUid}</small></td>
            <td><input class="input sm" type="number" min="0" max="99" data-kills="${p.uid}" value="${sheet[p.uid]?.kills ?? ''}" placeholder="0" ${editable ? '' : raw('disabled')}></td>
            <td><input class="input sm" type="number" min="1" max="${m.totalSlots}" data-rankin="${p.uid}" value="${sheet[p.uid]?.rank ?? ''}" placeholder="#" ${editable ? '' : raw('disabled')}></td>
            <td data-win="${p.uid}">₹0</td></tr>`;
        })}</tbody></table></div>
      ${editable ? html`<div id="result-summary" class="result-summary"></div>` : html`<p class="muted small">Total distributed: <b>${inr(m.distributed)}</b></p>`}`);
    renderResultSummary();
  }

  function renderAll() {
    if (match === undefined) return;
    if (match === null) { setHTML(el, emptyState({ iconName: 'alert', title: 'Match not found', action: '<a class="btn btn-primary" href="#/matches">Back</a>' })); return; }
    if (!$('#head', el)) layout();
    renderHead();
    renderRoom();
    renderPrize();
    renderPlayers();
    if (!el.contains(document.activeElement) || !document.activeElement.matches('[data-kills],[data-rankin]')) renderResults();
    else renderResultSummary();
  }

  // ───── listeners ─────
  d.add(listenMatch(id, (m) => { match = m; renderAll(); }));
  d.add(listenPlayers(id, (p) => { players = p; if (match) renderAll(); }));
  d.add(listenResults(id, (r) => { results = r; if (match) renderAll(); }));
  d.add(listenRoom(id, (r) => { room = r; if (match) renderRoom(); }));
  d.add(() => clearTimeout(unlockTimer));

  // ───── actions ─────
  d.add(on(el, 'input', '[data-kills],[data-rankin]', (e, input) => {
    const uid = input.dataset.kills || input.dataset.rankin;
    sheet[uid] = sheet[uid] || {};
    sheet[uid][input.dataset.kills ? 'kills' : 'rank'] = input.value;
    renderResultSummary();
  }));
  d.add(on(el, 'click', '[data-copy]', (e, b) => copyText(b.dataset.copy, 'Player ID copied')));
  d.add(on(el, 'click', '#copy-list', () => copyText(players.map((p) => `${p.slotNo}. ${p.ign} (${p.ffUid})`).join('\n'), 'Player list copied')));
  d.add(on(el, 'click', '#csv', () => {
    const rows = [['slot', 'ign', 'ff_uid', 'paid'], ...players.map((p) => [p.slotNo, p.ign, p.ffUid, p.fromDeposit + p.fromWinning])];
    const blob = new Blob([rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${match.title.replace(/\W+/g, '_')}_players.csv`;
    a.click();
  }));

  d.add(on(el, 'submit', '#room-form', async (e, form) => {
    e.preventDefault();
    const btn = $('#room-save', el);
    if (!form.roomId.value.trim()) { toast('Enter the Room ID', 'warn'); return; }
    setBusy(btn, true, 'Publishing…');
    try {
      await publishRoom(id, { roomId: form.roomId.value, roomPass: form.roomPass.value }, me());
      toast('Room details published to joined players 🔑', 'success');
    } catch (ex) { toast(friendlyError(ex), 'error'); }
    setBusy(btn, false);
  }));

  d.add(on(el, 'click', '#go-live', async (e, btn) => {
    if (!await confirmDialog({ title: 'Start the match?', message: 'Joining closes and the match moves to LIVE for all players.', confirmText: 'Go live' })) return;
    setBusy(btn, true, 'Starting…');
    try { await setMatchStatus(id, 'live'); toast('Match is LIVE 🔴', 'success'); } catch (ex) { toast(friendlyError(ex), 'error'); setBusy(btn, false); }
  }));

  async function runRefunds(alreadyCancelled) {
    const pm = progressModal('Refunding players…');
    try {
      const r = await cancelMatchAndRefund({ ...match, status: alreadyCancelled ? 'cancelled' : match.status }, me(), (done, total) => pm.update(done, total, 'Refunded'));
      toast(`Match cancelled · ${r.refunded} player(s) refunded`, 'success');
    } catch (ex) { toast(friendlyError(ex), 'error', 5000); }
    pm.close();
  }
  d.add(on(el, 'click', '#cancel-match', async () => {
    if (!await confirmDialog({ title: 'Cancel this match?', message: `All ${match.joinedCount} players get their entry fee back to the same balance they paid from. This cannot be undone.`, confirmText: 'Cancel & refund', danger: true })) return;
    runRefunds(false);
  }));
  d.add(on(el, 'click', '#resume-refund', () => runRefunds(true)));
  d.add(on(el, 'click', '#delete-match', async () => {
    if (!await confirmDialog({ title: 'Delete match?', message: 'No players have joined. The match will be removed permanently.', confirmText: 'Delete', danger: true })) return;
    try { await deleteMatch(id); toast('Match deleted', 'success'); go('/matches'); } catch (ex) { toast(friendlyError(ex), 'error'); }
  }));

  d.add(on(el, 'click', '#publish', async () => {
    const done = new Set(results.map((r) => r.uid));
    const rows = rowsForSheet().filter((r) => !done.has(r.uid)).map((r) => ({ ...r, kills: Number(r.kills) || 0, rank: Number(r.rank) || 0 }));
    const total = rows.reduce((a, r) => a + calcWinnings(match, r).amount, 0);
    if (!await confirmDialog({ title: 'Publish results?', message: `${rows.length} players · ${inr(total)} will be credited to winning balances instantly. Results cannot be edited afterwards.`, confirmText: 'Publish & pay' })) return;
    const pm = progressModal('Distributing winnings…');
    try {
      const r = await publishResults(match, rows, me(), (n, t) => pm.update(n, t, 'Credited'));
      toast(`Results published · ${inr(r.total)} credited to ${r.credited} player(s) 🏆`, 'success', 5000);
    } catch (ex) { toast(friendlyError(ex), 'error', 6000); }
    pm.close();
  }));

  return () => d.run();
}
