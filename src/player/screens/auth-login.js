// LOGIN screen
import { html, setHTML, $, readForm, on, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { CONFIG } from '../../shared/config.js';
import { friendlyError } from '../../shared/errors.js';
import { setBusy, toast } from '../../shared/ui.js';
import { login } from '../../services/auth.service.js';
import { authHero, passwordToggleHandler } from '../components/auth-ui.js';

export default function LoginScreen(el) {
  const d = createDisposer();
  const demo = CONFIG.demoMode ? CONFIG.demoAccounts.player || [] : [];

  setHTML(el, html`
    <section class="auth-page">
      ${authHero('Welcome back, Survivor', 'Log in to join paid Free Fire tournaments and win real cash.')}
      <form class="form card auth-card" id="login-form" novalidate>
        <label class="field">
          <span class="field-label">Email</span>
          <div class="input-wrap">${icon('mail')}<input class="input" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
        </label>
        <label class="field">
          <span class="field-label">Password</span>
          <div class="input-wrap">${icon('lock')}<input class="input" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required minlength="6">
            <button type="button" class="input-action" data-toggle-pass aria-label="Show password">${icon('eye')}</button></div>
        </label>
        <div class="row-between">
          <span></span>
          <a href="#/forgot" class="link">Forgot password?</a>
        </div>
        <p class="form-error" id="login-error" role="alert"></p>
        <button class="btn btn-primary btn-block btn-lg" type="submit" id="login-btn">${icon('login')}<span>Log in</span></button>
        <p class="auth-switch">New to ${CONFIG.brand.name}? <a href="#/signup" class="link">Create an account</a></p>
      </form>
      ${demo.length ? html`
        <div class="demo-box">
          <div class="demo-title">${icon('zap')} Demo player accounts (tap to fill)</div>
          ${demo.map((a) => html`<button class="demo-chip" data-email="${a.email}" data-pass="${a.password}"><b>${a.label}</b><small>${a.email}</small></button>`)}
        </div>` : ''}
      <p class="legal">18+ only. Skill-based gaming. Play responsibly.</p>
    </section>`);

  const form = $('#login-form', el);
  d.add(on(el, 'click', '[data-toggle-pass]', passwordToggleHandler));
  d.add(on(el, 'click', '.demo-chip', (e, btn) => {
    form.email.value = btn.dataset.email;
    form.password.value = btn.dataset.pass;
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { email, password } = readForm(form);
    const err = $('#login-error', el);
    err.textContent = '';
    if (!email || !password) { err.textContent = 'Enter your email and password.'; return; }
    const btn = $('#login-btn', el);
    setBusy(btn, true, 'Logging in…');
    try {
      await login(email, password);
      toast('Welcome back! 🎮', 'success');
      // main.js auth listener redirects to /home
    } catch (ex) {
      err.textContent = friendlyError(ex);
      setBusy(btn, false);
    }
  });

  return () => d.run();
}
