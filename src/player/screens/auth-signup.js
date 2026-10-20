// SIGN-UP screen
import { html, setHTML, $, readForm, on, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { CONFIG } from '../../shared/config.js';
import { friendlyError } from '../../shared/errors.js';
import { setBusy, toast } from '../../shared/ui.js';
import { signUp } from '../../services/auth.service.js';
import { authHero, passwordToggleHandler } from '../components/auth-ui.js';

function validate(v) {
  if (!v.name || v.name.length < 2) return 'Enter your full name.';
  if (!/^\S+@\S+\.\S+$/.test(v.email)) return 'Enter a valid email address.';
  if (!/^[6-9]\d{9}$/.test(v.phone)) return 'Enter a valid 10-digit Indian mobile number.';
  if (v.ffUid && !/^\d{5,15}$/.test(v.ffUid)) return 'Free Fire Player ID must be 5–15 digits.';
  if (!v.password || v.password.length < 6) return 'Password must be at least 6 characters.';
  if (v.password !== v.confirm) return 'Passwords do not match.';
  if (!v.agree) return 'Please confirm you are 18+ and accept the rules.';
  return null;
}

export default function SignupScreen(el) {
  const d = createDisposer();
  setHTML(el, html`
    <section class="auth-page">
      ${authHero('Create your account', 'Join tournaments, climb the leaderboard and withdraw winnings via UPI.')}
      <form class="form card auth-card" id="signup-form" novalidate>
        <label class="field">
          <span class="field-label">Full name</span>
          <div class="input-wrap">${icon('user')}<input class="input" name="name" autocomplete="name" placeholder="Rahul Sharma" maxlength="40" required></div>
        </label>
        <label class="field">
          <span class="field-label">Email</span>
          <div class="input-wrap">${icon('mail')}<input class="input" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
        </label>
        <label class="field">
          <span class="field-label">Mobile number</span>
          <div class="input-wrap prefix">${icon('phone')}<span class="prefix-txt">+91</span><input class="input" name="phone" inputmode="numeric" maxlength="10" placeholder="9876543210" required></div>
        </label>
        <div class="grid-2">
          <label class="field">
            <span class="field-label">FF In-Game Name <em>(optional)</em></span>
            <input class="input" name="ign" maxlength="24" placeholder="xXSniperXx">
          </label>
          <label class="field">
            <span class="field-label">FF Player ID <em>(optional)</em></span>
            <input class="input" name="ffUid" inputmode="numeric" maxlength="15" placeholder="123456789">
          </label>
        </div>
        <label class="field">
          <span class="field-label">Password</span>
          <div class="input-wrap">${icon('lock')}<input class="input" name="password" type="password" autocomplete="new-password" minlength="6" placeholder="Min. 6 characters" required>
            <button type="button" class="input-action" data-toggle-pass aria-label="Show password">${icon('eye')}</button></div>
        </label>
        <label class="field">
          <span class="field-label">Confirm password</span>
          <div class="input-wrap">${icon('lock')}<input class="input" name="confirm" type="password" autocomplete="new-password" placeholder="Repeat password" required></div>
        </label>
        <label class="check">
          <input type="checkbox" name="agree"> <span>I am 18+ and agree to the tournament rules &amp; fair-play policy.</span>
        </label>
        <p class="form-error" id="signup-error" role="alert"></p>
        <button class="btn btn-primary btn-block btn-lg" type="submit" id="signup-btn">${icon('zap')}<span>Create account</span></button>
        <p class="auth-switch">Already have an account? <a href="#/login" class="link">Log in</a></p>
      </form>
    </section>`);

  const form = $('#signup-form', el);
  d.add(on(el, 'click', '[data-toggle-pass]', passwordToggleHandler));
  form.phone.addEventListener('input', () => { form.phone.value = form.phone.value.replace(/\D/g, '').slice(0, 10); });
  form.ffUid.addEventListener('input', () => { form.ffUid.value = form.ffUid.value.replace(/\D/g, '').slice(0, 15); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = readForm(form);
    const err = $('#signup-error', el);
    err.textContent = validate(v) || '';
    if (err.textContent) return;
    const btn = $('#signup-btn', el);
    setBusy(btn, true, 'Creating account…');
    try {
      await signUp(v);
      toast(`Welcome to ${CONFIG.brand.name}, ${v.name.split(' ')[0]}! 🔥`, 'success');
    } catch (ex) {
      err.textContent = friendlyError(ex);
      setBusy(btn, false);
    }
  });

  return () => d.run();
}
