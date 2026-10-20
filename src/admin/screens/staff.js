// STAFF & ROLES (Super Admin) – add up to N co-admins, toggle access & permissions.
import { html, raw, setHTML, $, on, readForm, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { initials, fmtDate } from '../../shared/format.js';
import { friendlyError } from '../../shared/errors.js';
import { toast, openModal, confirmDialog, setBusy, emptyState } from '../../shared/ui.js';
import {
  listenAllStaff, createStaffAccount, promoteExistingUser, updateStaff, removeStaff, sendStaffPasswordReset,
} from '../../services/admin/staff.service.js';
import { store, me } from '../app.js';

export default function StaffScreen(el) {
  const d = createDisposer();
  let staff = null;
  const maxStaff = () => store.get().config.limits.maxStaff || 15;

  setHTML(el, html`
    <div class="toolbar">
      <div><span class="muted" id="seats"></span></div>
      <div class="toolbar-right"><button class="btn btn-primary" id="add-staff">${icon('plus')}<span>Add staff</span></button></div>
    </div>
    <div class="notice mb-12">${icon('shield')}<span><b>Super Admin</b>: full control. <b>Staff / Co-Admin</b>: create &amp; manage only their own matches (tagged with their admin ID), publish rooms and upload results. Staff can never edit settings, roles or withdrawals – enforced by Firestore rules, not just the UI.</span></div>
    <div class="staff-grid" id="grid"></div>`);

  function render() {
    const grid = $('#grid', el);
    if (!staff) { setHTML(grid, html`<div class="card"><div class="sk sk-line"></div></div>`); return; }
    const coAdmins = staff.filter((s) => s.role === 'staff');
    $('#seats', el).textContent = `${coAdmins.length} / ${maxStaff()} co-admin seats used`;
    if (!staff.length) { setHTML(grid, emptyState({ iconName: 'shield', title: 'No staff yet' })); return; }
    setHTML(grid, html`${staff.map((s) => html`
      <div class="card staff-card ${s.active ? '' : 'inactive'}">
        <div class="staff-top">
          <div class="avatar sm">${initials(s.name)}</div>
          <div class="ellipsis"><b class="ellipsis">${s.name}</b><small class="muted ellipsis">${s.email}</small></div>
          <span class="chip ${s.role === 'super' ? 'chip-super' : 'chip-staff'} small">${s.role === 'super' ? 'Super Admin' : 'Staff'}</span>
        </div>
        <div class="staff-meta muted small">Admin ID: <code>${s.uid.slice(0, 10)}…</code> · since ${fmtDate(s.createdAt)}</div>
        ${s.uid === me().uid ? html`<p class="muted small">This is you.</p>` : html`
          <label class="toggle-row"><span>Active access</span><span class="switch"><input type="checkbox" data-active="${s.uid}" ${s.active ? raw('checked') : ''}><span></span></span></label>
          <label class="toggle-row"><span>Can verify deposits</span><span class="switch"><input type="checkbox" data-dep="${s.uid}" ${s.perms?.deposits ? raw('checked') : ''}><span></span></span></label>
          <div class="row-gap">
            <button class="btn btn-ghost btn-sm" data-reset="${s.email}">${icon('key')}<span>Reset password</span></button>
            <button class="btn btn-danger btn-sm" data-remove="${s.uid}">${icon('trash')}<span>Remove</span></button>
          </div>`}
      </div>`)}`);
  }

  function addStaffModal() {
    const coAdmins = (staff || []).filter((s) => s.role === 'staff').length;
    if (coAdmins >= maxStaff()) { toast(`Staff limit reached (${maxStaff()}). Increase it in App Settings.`, 'warn'); return; }
    openModal({
      title: 'Add staff member',
      body: String(html`
        <form class="form" id="staff-form">
          <div class="seg-radio small">
            <label class="active"><input type="radio" name="mode" value="new" checked>New login</label>
            <label><input type="radio" name="mode" value="promote">Existing player</label>
          </div>
          <label class="field"><span class="field-label">Display name (shown as staff_name on matches)</span><input class="input" name="name" maxlength="40" required placeholder="e.g. Rahul"></label>
          <label class="field"><span class="field-label">Email</span><input class="input" type="email" name="email" required placeholder="staff@yourdomain.com"></label>
          <label class="field" id="pass-field"><span class="field-label">Temporary password</span><input class="input" name="password" minlength="6" placeholder="Min. 6 characters" value="${'Staff@' + Math.floor(1000 + Math.random() * 9000)}"></label>
          <div class="grid-2">
            <label class="field"><span class="field-label">Role</span><select class="input" name="role"><option value="staff">Staff / Co-Admin</option><option value="super">Super Admin</option></select></label>
            <label class="toggle-row boxed"><span>Can verify deposits</span><span class="switch"><input type="checkbox" name="deposits"><span></span></span></label>
          </div>
          <p class="form-error" id="sf-error"></p>
        </form>`),
      actions: [
        { label: 'Cancel', value: null, variant: 'btn-ghost' },
        {
          label: 'Add staff',
          onClick: async (wrap, close, btn) => {
            const form = wrap.querySelector('#staff-form');
            const v = readForm(form);
            const err = wrap.querySelector('#sf-error');
            err.textContent = '';
            if (!v.name || v.name.length < 2 || !/^\S+@\S+\.\S+$/.test(v.email)) { err.textContent = 'Enter a name and a valid email.'; return true; }
            if (v.mode === 'new' && (!v.password || v.password.length < 6)) { err.textContent = 'Password must be at least 6 characters.'; return true; }
            setBusy(btn, true, 'Adding…');
            try {
              const payload = { name: v.name, email: v.email, password: v.password, role: v.role, perms: { deposits: v.deposits } };
              if (v.mode === 'new') await createStaffAccount(payload, me());
              else await promoteExistingUser(payload, me());
              toast(`${v.name} added as ${v.role === 'super' ? 'Super Admin' : 'staff'}${v.mode === 'new' ? ` · password: ${v.password}` : ''}`, 'success', 6000);
              return false;
            } catch (ex) {
              err.textContent = friendlyError(ex);
              setBusy(btn, false);
              return true;
            }
          },
        },
      ],
      onMount: (wrap) => {
        wrap.addEventListener('change', (e) => {
          if (e.target.name !== 'mode') return;
          wrap.querySelectorAll('.seg-radio label').forEach((l) => l.classList.toggle('active', l.contains(e.target)));
          wrap.querySelector('#pass-field').classList.toggle('hidden', e.target.value !== 'new');
        });
      },
    });
  }

  const find = (uid) => staff.find((s) => s.uid === uid);
  const strip = (s) => ({ uid: s.uid, name: s.name, email: s.email, role: s.role, active: s.active, perms: s.perms || {}, createdAt: s.createdAt, createdBy: s.createdBy });

  d.add(listenAllStaff((list) => { staff = list; render(); }, (e) => toast(friendlyError(e), 'error')));
  d.add(on(el, 'click', '#add-staff', addStaffModal));
  d.add(on(el, 'change', '[data-active]', async (e, input) => {
    const s = find(input.dataset.active);
    try { await updateStaff(s.uid, { ...strip(s), active: input.checked }); toast(`${s.name} ${input.checked ? 'activated' : 'deactivated'}`, 'success'); } catch (ex) { toast(friendlyError(ex), 'error'); input.checked = !input.checked; }
  }));
  d.add(on(el, 'change', '[data-dep]', async (e, input) => {
    const s = find(input.dataset.dep);
    try { await updateStaff(s.uid, { ...strip(s), perms: { ...(s.perms || {}), deposits: input.checked } }); toast('Permission updated', 'success'); } catch (ex) { toast(friendlyError(ex), 'error'); input.checked = !input.checked; }
  }));
  d.add(on(el, 'click', '[data-reset]', async (e, b) => {
    try { await sendStaffPasswordReset(b.dataset.reset); toast(`Reset link sent to ${b.dataset.reset}`, 'success'); } catch (ex) { toast(friendlyError(ex), 'error'); }
  }));
  d.add(on(el, 'click', '[data-remove]', async (e, b) => {
    const s = find(b.dataset.remove);
    if (!await confirmDialog({ title: `Remove ${s.name}?`, message: 'They lose staff access immediately. Matches they hosted keep their admin tag.', confirmText: 'Remove', danger: true })) return;
    try { await removeStaff(s.uid); toast('Staff removed', 'success'); } catch (ex) { toast(friendlyError(ex), 'error'); }
  }));
  return () => d.run();
}
