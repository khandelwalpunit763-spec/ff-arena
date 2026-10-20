// PLAYERS (Super Admin) – search, view wallet, ban / unban, manual wallet adjustment.
import { html, setHTML, $, on, readForm, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { inr, fmtDate, initials } from '../../shared/format.js';
import { friendlyError } from '../../shared/errors.js';
import { toast, openModal, setBusy, emptyState } from '../../shared/ui.js';
import { listUsers, getWallet, setUserBanned, adjustWallet } from '../../services/admin/finance.service.js';

export default function UsersScreen(el) {
  const d = createDisposer();
  let users = null;
  let q = '';

  setHTML(el, html`
    <div class="toolbar">
      <div class="input-wrap search wide">${icon('search')}<input class="input" id="q" placeholder="Search name, email, phone, IGN or FF ID"></div>
      <div class="toolbar-right"><span class="muted small" id="count"></span></div>
    </div>
    <div class="card no-pad" id="list"></div>`);

  function render() {
    const box = $('#list', el);
    if (!users) { setHTML(box, html`<div class="pad"><div class="sk sk-line"></div><div class="sk sk-line"></div></div>`); return; }
    const s = q.toLowerCase();
    const list = users.filter((u) => !s || [u.name, u.email, u.phone, u.ign, u.ffUid].some((f) => String(f || '').toLowerCase().includes(s)));
    $('#count', el).textContent = `${list.length} of ${users.length} players`;
    if (!list.length) { setHTML(box, emptyState({ iconName: 'users', title: 'No players found' })); return; }
    setHTML(box, html`<div class="dtable-wrap"><table class="dtable hover">
      <thead><tr><th>Player</th><th>Phone</th><th>Free Fire</th><th>Joined</th><th>Status</th></tr></thead>
      <tbody>${list.map((u) => html`<tr data-user="${u.uid}">
        <td><div class="user-cell"><div class="avatar xs">${initials(u.name)}</div><div><b>${u.name}</b><br><small class="muted">${u.email}</small></div></div></td>
        <td>${u.phone || '—'} ${u.phoneVerified ? html`<span class="chip chip-done small">✓</span>` : ''}</td>
        <td>${u.ign || '—'}<br><small class="muted">${u.ffUid || ''}</small></td>
        <td class="muted">${fmtDate(u.createdAt)}</td>
        <td>${u.banned ? html`<span class="chip chip-live small">Banned</span>` : html`<span class="chip chip-done small">Active</span>`}</td>
      </tr>`)}</tbody></table></div>`);
  }

  async function openUser(uid) {
    const u = users.find((x) => x.uid === uid);
    const w = await getWallet(uid).catch(() => ({ deposit: 0, winning: 0 }));
    openModal({
      title: u.name,
      body: String(html`
        <p class="muted small">${u.email} · ${u.phone || 'no phone'} · IGN ${u.ign || '—'} (${u.ffUid || '—'})</p>
        <div class="balance-mini"><div><span>Deposit</span><b>${inr(w.deposit)}</b></div><div><span>Winning</span><b>${inr(w.winning)}</b></div></div>
        <form class="form" id="adj-form">
          <div class="form-section">${icon('settings')} Manual wallet adjustment</div>
          <div class="grid-2">
            <label class="field"><span class="field-label">Deposit ± ₹</span><input class="input" type="number" name="dep" value="0"></label>
            <label class="field"><span class="field-label">Winning ± ₹</span><input class="input" type="number" name="win" value="0"></label>
          </div>
          <label class="field"><span class="field-label">Note (visible to player)</span><input class="input" name="note" maxlength="100" placeholder="e.g. Bonus for tournament issue"></label>
          <p class="form-error" id="adj-error"></p>
        </form>`),
      actions: [
        {
          label: u.banned ? 'Unban player' : 'Ban player',
          variant: u.banned ? 'btn-success' : 'btn-danger',
          onClick: async (wrap, close, btn) => {
            setBusy(btn, true, '…');
            try { await setUserBanned(uid, !u.banned); u.banned = !u.banned; render(); toast(u.banned ? 'Player banned (cannot join matches)' : 'Player unbanned', 'success'); return false; } catch (ex) { toast(friendlyError(ex), 'error'); setBusy(btn, false); return true; }
          },
        },
        {
          label: 'Apply adjustment',
          onClick: async (wrap, close, btn) => {
            const v = readForm(wrap.querySelector('#adj-form'));
            const dep = Math.trunc(Number(v.dep) || 0);
            const win = Math.trunc(Number(v.win) || 0);
            if (!dep && !win) { wrap.querySelector('#adj-error').textContent = 'Enter an amount.'; return true; }
            setBusy(btn, true, 'Applying…');
            try { await adjustWallet(uid, { depositDelta: dep, winningDelta: win, note: v.note || 'Admin adjustment' }); toast('Wallet adjusted', 'success'); return false; } catch (ex) { wrap.querySelector('#adj-error').textContent = friendlyError(ex); setBusy(btn, false); return true; }
          },
        },
      ],
    });
  }

  listUsers().then((list) => { users = list; render(); }).catch((e) => setHTML($('#list', el), html`<div class="notice danger">${friendlyError(e)}</div>`));
  render();
  d.add(on(el, 'input', '#q', (e, i) => { q = i.value; render(); }));
  d.add(on(el, 'click', 'tr[data-user]', (e, tr) => openUser(tr.dataset.user)));
  return () => d.run();
}
