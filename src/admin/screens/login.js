// STAFF LOGIN – only accounts with an active /staff/{uid} document get in.
import { html, setHTML, $, on, readForm, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { CONFIG } from '../../shared/config.js';
import { friendlyError } from '../../shared/errors.js';
import { setBusy } from '../../shared/ui.js';
import { login, logout, sendResetEmail } from '../../services/auth.service.js';
import { getStaffProfile } from '../../services/admin/staff.service.js';
import { toast } from '../../shared/ui.js';

export default function AdminLoginScreen(el, params) {
  const d = createDisposer();
  const demo = CONFIG.demoMode ? CONFIG.demoAccounts.staff || [] : [];
  const denied = params.query.get('denied');

  setHTML(el, html`
    <section class="admin-auth">
      <div class="admin-auth-card card">
        <div class="admin-auth-head">
          <span class="brand-mark lg">${icon('shield')}</span>
          <h2>Staff Console</h2>
          <p class="muted">${CONFIG.brand.name} · Super Admin &amp; Co-Admin login</p>
        </div>
        ${denied ? html`<div class="notice danger">${icon('ban')}<span>This account does not have active staff access. Contact the Super Admin.</span></div>` : ''}
        <form class="form" id="staff-login" novalidate>
          <label class="field"><span class="field-label">Staff email</span>
            <div class="input-wrap">${icon('mail')}<input class="input" name="email" type="email" autocomplete="username" placeholder="staff@yourdomain.com" required></div></label>
          <label class="field"><span class="field-label">Password</span>
            <div class="input-wrap">${icon('lock')}<input class="input" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required></div></label>
          <p class="form-error" id="sl-error"></p>
          <button class="btn btn-primary btn-lg btn-block" id="sl-btn">${icon('login')}<span>Secure login</span></button>
          <button type="button" class="btn btn-ghost btn-block btn-sm" id="sl-reset">Forgot password? Send reset link</button>
        </form>
        ${demo.length ? html`
          <div class="demo-box">
            <div class="demo-title">${icon('zap')} Demo staff accounts</div>
            ${demo.map((a) => html`<button class="demo-chip" data-email="${a.email}" data-pass="${a.password}"><b>${a.label}</b><small>${a.email}</small></button>`)}
          </div>` : ''}
        <p class="legal">Every action is tagged with your staff ID. Unauthorised access is logged.</p>
      </div>
    </section>`);

  const form = $('#staff-login', el);
  d.add(on(el, 'click', '.demo-chip', (e, b) => { form.email.value = b.dataset.email; form.password.value = b.dataset.pass; }));
  d.add(on(el, 'click', '#sl-reset', async () => {
    const email = form.email.value.trim();
    if (!email) { toast('Enter your staff email first', 'warn'); return; }
    try { await sendResetEmail(email); toast('Reset link sent if the account exists', 'success'); } catch (ex) { toast(friendlyError(ex), 'error'); }
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { email, password } = readForm(form);
    const err = $('#sl-error', el);
    err.textContent = '';
    const btn = $('#sl-btn', el);
    setBusy(btn, true, 'Verifying…');
    try {
      const user = await login(email, password);
      const staff = await getStaffProfile(user.uid).catch(() => null);
      if (!staff || !staff.active) {
        // allow the bootstrap owner to reach the setup wizard
        if (!staff) { setBusy(btn, false); return; }
        await logout();
        err.textContent = 'Your staff access is disabled. Contact the Super Admin.';
        setBusy(btn, false);
      }
      // main.js handles routing once the staff doc loads
    } catch (ex) {
      err.textContent = friendlyError(ex);
      setBusy(btn, false);
    }
  });
  return () => d.run();
}
