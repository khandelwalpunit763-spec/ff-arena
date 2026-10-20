// FIRST-RUN SETUP – the bootstrap owner (e-mail whitelisted in firestore.rules) claims Super Admin.
import { html, setHTML, $, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { friendlyError } from '../../shared/errors.js';
import { setBusy, toast } from '../../shared/ui.js';
import { claimSuperAdmin } from '../../services/admin/staff.service.js';
import { logout } from '../../services/auth.service.js';
import { store } from '../app.js';

export default function SetupScreen(el) {
  const d = createDisposer();
  const { user, configExists } = store.get();

  setHTML(el, html`
    <section class="admin-auth">
      <div class="admin-auth-card card">
        <div class="admin-auth-head">
          <span class="brand-mark lg">${icon('crown')}</span>
          <h2>${configExists ? 'No staff access' : 'First-time setup'}</h2>
          <p class="muted">Signed in as <b>${user?.email}</b></p>
        </div>
        ${configExists ? html`
          <div class="notice danger">${icon('ban')}<span>This account is not a staff member. Ask the Super Admin to add you from <b>Staff &amp; Roles</b>.</span></div>
          <button class="btn btn-ghost btn-block" id="setup-logout">${icon('logout')}<span>Log out</span></button>
        ` : html`
          <div class="notice">${icon('info')}<span>No Super Admin exists yet. If your email is whitelisted in <code>isBootstrapOwner()</code> inside <code>firestore.rules</code>, you can claim the Super Admin seat now. This works only once.</span></div>
          <form class="form" id="setup-form">
            <label class="field"><span class="field-label">Your display name</span><input class="input" name="name" value="${user?.displayName || 'Owner'}" required></label>
            <p class="form-error" id="setup-error"></p>
            <button class="btn btn-primary btn-lg btn-block" id="setup-btn">${icon('crown')}<span>Claim Super Admin</span></button>
            <button type="button" class="btn btn-ghost btn-block" id="setup-logout">${icon('logout')}<span>Use another account</span></button>
          </form>`}
      </div>
    </section>`);

  $('#setup-logout', el)?.addEventListener('click', () => logout());
  $('#setup-form', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#setup-btn', el);
    setBusy(btn, true, 'Setting up…');
    try {
      await claimSuperAdmin(store.get().user, e.target.name.value);
      toast('You are now the Super Admin 👑', 'success');
    } catch (ex) {
      $('#setup-error', el).textContent = ex.code === 'permission-denied'
        ? 'Denied: this email is not whitelisted in isBootstrapOwner() (firestore.rules), or setup was already completed.'
        : friendlyError(ex);
      setBusy(btn, false);
    }
  });
  return () => d.run();
}
