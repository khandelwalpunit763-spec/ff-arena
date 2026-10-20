// FORGOT PASSWORD – (1) e-mail reset link  (2) Mobile OTP → set a new password
import { html, setHTML, $, readForm, on, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { CONFIG } from '../../shared/config.js';
import { friendlyError } from '../../shared/errors.js';
import { setBusy, toast } from '../../shared/ui.js';
import {
  sendResetEmail, createRecaptcha, sendRecoveryOtp, confirmRecoveryOtp, setNewPassword, fetchEmulatorOtp, logout,
} from '../../services/auth.service.js';
import { authHero } from '../components/auth-ui.js';
import { store, go } from '../app.js';

export default function ForgotScreen(el) {
  const d = createDisposer();
  let mode = 'email';
  let confirmation = null;
  let verifier = null;
  let recaptchaEl = null;          // lives outside the re-rendered markup
  let otpPhone = '';

  const otpEnabled = () => store.get().config.features.phoneOtp;

  function emailView() {
    return html`
      <form class="form" id="email-form" novalidate>
        <label class="field">
          <span class="field-label">Registered email</span>
          <div class="input-wrap">${icon('mail')}<input class="input" name="email" type="email" placeholder="you@example.com" required></div>
        </label>
        <p class="form-error" id="f-error"></p>
        <button class="btn btn-primary btn-block btn-lg" id="email-btn">${icon('send')}<span>Send reset link</span></button>
        <p class="hint center">We'll email you a secure link to set a new password.</p>
      </form>`;
  }

  function otpPhoneView() {
    if (!otpEnabled()) {
      return html`<div class="notice">${icon('info')}<span>Mobile OTP recovery is not enabled by the admin yet. Please use the email option.</span></div>`;
    }
    return html`
      <form class="form" id="otp-phone-form" novalidate>
        <label class="field">
          <span class="field-label">Mobile number linked to your account</span>
          <div class="input-wrap prefix">${icon('phone')}<span class="prefix-txt">+91</span><input class="input" name="phone" inputmode="numeric" maxlength="10" placeholder="9876543210" required></div>
        </label>
        <p class="form-error" id="f-error"></p>
        <button class="btn btn-primary btn-block btn-lg" id="otp-send-btn">${icon('send')}<span>Send OTP</span></button>
        <p class="hint center">Link your mobile number from <b>Profile → Link mobile</b> to use OTP recovery.</p>
      </form>`;
  }

  function otpCodeView() {
    return html`
      <form class="form" id="otp-code-form" novalidate>
        <p class="muted center">Enter the 6-digit OTP sent to <b>+91 ${otpPhone}</b></p>
        <input class="input otp-input" name="code" inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="one-time-code" required>
        ${CONFIG.demoMode ? html`<p class="demo-otp" id="demo-otp">Fetching demo OTP from emulator…</p>` : ''}
        <p class="form-error" id="f-error"></p>
        <button class="btn btn-primary btn-block btn-lg" id="otp-verify-btn">${icon('check')}<span>Verify OTP</span></button>
        <button type="button" class="btn btn-ghost btn-block" data-restart>Change number</button>
      </form>`;
  }

  function newPassView() {
    return html`
      <form class="form" id="newpass-form" novalidate>
        <div class="notice success">${icon('shield')}<span>Mobile verified. Set a new password for your account.</span></div>
        <label class="field"><span class="field-label">New password</span>
          <div class="input-wrap">${icon('lock')}<input class="input" name="password" type="password" minlength="6" placeholder="Min. 6 characters" required></div></label>
        <label class="field"><span class="field-label">Confirm new password</span>
          <div class="input-wrap">${icon('lock')}<input class="input" name="confirm" type="password" placeholder="Repeat password" required></div></label>
        <p class="form-error" id="f-error"></p>
        <button class="btn btn-primary btn-block btn-lg" id="newpass-btn">${icon('check')}<span>Save new password</span></button>
      </form>`;
  }

  function render(step = 'start') {
    let body;
    if (mode === 'email') body = emailView();
    else if (step === 'code') body = otpCodeView();
    else if (step === 'newpass') body = newPassView();
    else body = otpPhoneView();

    setHTML(el, html`
      <section class="auth-page">
        ${authHero('Forgot password?', 'Recover your account using email or mobile OTP.')}
        <div class="card auth-card">
          <div class="seg-tabs small">
            <button type="button" data-mode="email" class="${mode === 'email' ? 'active' : ''}">${icon('mail')} Email</button>
            <button type="button" data-mode="otp" class="${mode === 'otp' ? 'active' : ''}">${icon('phone')} Mobile OTP</button>
          </div>
          ${body}
          <p class="auth-switch"><a href="#/login" class="link">${icon('chevronLeft')} Back to login</a></p>
        </div>
      </section>`);
  }

  render();

  d.add(on(el, 'click', '[data-mode]', (e, btn) => {
    mode = btn.dataset.mode;
    render();
  }));
  d.add(on(el, 'click', '[data-restart]', () => { confirmation = null; render('start'); }));
  d.add(on(el, 'input', '[name=phone],[name=code]', (e, input) => { input.value = input.value.replace(/\D/g, ''); }));

  d.add(on(el, 'submit', 'form', async (e, form) => {
    e.preventDefault();
    const err = $('#f-error', el);
    err.textContent = '';
    const v = readForm(form);
    const btn = form.querySelector('button.btn-primary');

    try {
      if (form.id === 'email-form') {
        if (!/^\S+@\S+\.\S+$/.test(v.email)) { err.textContent = 'Enter a valid email.'; return; }
        setBusy(btn, true, 'Sending…');
        await sendResetEmail(v.email);
        setHTML(form, html`<div class="notice success">${icon('check')}<span>If an account exists for <b>${v.email}</b>, a reset link has been sent. Check your inbox &amp; spam folder.</span></div>`);
      }

      if (form.id === 'otp-phone-form') {
        if (!/^[6-9]\d{9}$/.test(v.phone)) { err.textContent = 'Enter a valid 10-digit mobile number.'; return; }
        setBusy(btn, true, 'Sending OTP…');
        if (!verifier) {
          recaptchaEl = document.createElement('div');
          recaptchaEl.className = 'recaptcha-holder';
          document.body.appendChild(recaptchaEl);
          verifier = createRecaptcha(recaptchaEl);
        }
        otpPhone = v.phone;
        confirmation = await sendRecoveryOtp(v.phone, verifier);
        toast('OTP sent', 'success');
        render('code');
        if (CONFIG.demoMode) {
          const code = await fetchEmulatorOtp(v.phone).catch(() => null);
          const box = $('#demo-otp', el);
          if (box) box.textContent = code ? `Demo OTP (emulator): ${code}` : 'Demo OTP not found';
        }
      }

      if (form.id === 'otp-code-form') {
        if (!/^\d{6}$/.test(v.code)) { err.textContent = 'Enter the 6-digit OTP.'; return; }
        setBusy(btn, true, 'Verifying…');
        await confirmRecoveryOtp(confirmation, v.code);
        render('newpass');
      }

      if (form.id === 'newpass-form') {
        if (v.password.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }
        if (v.password !== v.confirm) { err.textContent = 'Passwords do not match.'; return; }
        setBusy(btn, true, 'Saving…');
        await setNewPassword(v.password);
        toast('Password updated. You are logged in! 🎉', 'success');
        go('/home', { replace: true });
      }
    } catch (ex) {
      err.textContent = friendlyError(ex);
      setBusy(btn, false);
      if (form.id === 'otp-code-form' && ex.code === 'PHONE_NOT_LINKED') {
        await logout().catch(() => {});
      }
    }
  }));

  return () => {
    d.run();
    try { verifier?.clear(); } catch { /* ignore */ }
    recaptchaEl?.remove();
  };
}
