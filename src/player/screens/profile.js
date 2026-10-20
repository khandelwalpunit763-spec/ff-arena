// PROFILE – edit details, link mobile (OTP recovery), password reset, logout
import { html, setHTML, $, on, readForm, createDisposer } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { initials, fmtDate } from '../../shared/format.js';
import { CONFIG } from '../../shared/config.js';
import { friendlyError } from '../../shared/errors.js';
import { setBusy, toast, confirmDialog, openModal } from '../../shared/ui.js';
import { updateMyProfile } from '../../services/user.service.js';
import { logout, sendResetEmail, createRecaptcha, sendLinkOtp, fetchEmulatorOtp } from '../../services/auth.service.js';
import { store } from '../app.js';

export default function ProfileScreen(el) {
  const d = createDisposer();

  function render() {
    const { profile, user, config, entries } = store.get();
    if (!profile) { setHTML(el, html`<section class="page"><div class="card skeleton-card"><div class="sk sk-line"></div><div class="sk sk-line short"></div></div></section>`); return; }
    setHTML(el, html`
      <section class="page profile">
        <div class="profile-head card">
          <div class="avatar">${initials(profile.name)}</div>
          <div class="profile-id">
            <h2>${profile.name}</h2>
            <p class="muted small">${user.email}</p>
            <p class="muted small">Member since ${fmtDate(profile.createdAt)} · ${entries.size} matches</p>
          </div>
        </div>

        <form class="card form" id="profile-form" novalidate>
          <div class="card-head"><h3>${icon('user')} Player details</h3></div>
          <label class="field"><span class="field-label">Full name</span><input class="input" name="name" maxlength="40" value="${profile.name}" required></label>
          <label class="field">
            <span class="field-label">Mobile ${profile.phoneVerified ? html`<span class="chip chip-done small">${icon('check')}Verified</span>` : ''}</span>
            <div class="input-wrap prefix">${icon('phone')}<span class="prefix-txt">+91</span><input class="input" name="phone" inputmode="numeric" maxlength="10" value="${profile.phone}"></div>
          </label>
          <div class="grid-2">
            <label class="field"><span class="field-label">FF In-Game Name</span><input class="input" name="ign" maxlength="24" value="${profile.ign}"></label>
            <label class="field"><span class="field-label">FF Player ID</span><input class="input" name="ffUid" inputmode="numeric" maxlength="15" value="${profile.ffUid}"></label>
          </div>
          <p class="form-error" id="p-error"></p>
          <button class="btn btn-primary btn-block" id="p-save">${icon('check')}<span>Save changes</span></button>
        </form>

        <div class="card menu-list">
          ${config.features.phoneOtp && !profile.phoneVerified ? html`<button class="menu-item" id="link-phone">${icon('phone')}<span>Link mobile for OTP recovery</span>${icon('chevronRight')}</button>` : ''}
          <button class="menu-item" id="reset-pass">${icon('key')}<span>Change password (email link)</span>${icon('chevronRight')}</button>
          <a class="menu-item" href="#/my-matches">${icon('trophy')}<span>My matches</span>${icon('chevronRight')}</a>
          <a class="menu-item" href="#/wallet">${icon('wallet')}<span>Wallet &amp; transactions</span>${icon('chevronRight')}</a>
          ${config.supportContact ? html`<div class="menu-item static">${icon('headset')}<span>Support: <b>${config.supportContact}</b></span></div>` : ''}
          <button class="menu-item danger" id="logout">${icon('logout')}<span>Log out</span></button>
        </div>
        <p class="legal">${CONFIG.brand.name} v1.0 · 18+ · Play responsibly</p>
      </section>`);
  }

  async function linkPhoneFlow() {
    const { profile, user } = store.get();
    let phone = profile.phone;
    let confirmation = null;
    let verifier = null;
    const holder = document.createElement('div');
    document.body.appendChild(holder);
    openModal({
      title: 'Link mobile number',
      body: String(html`
        <form class="form" id="lp-form">
          <p class="muted small">We'll send an OTP to verify this number. Once linked you can reset your password with OTP.</p>
          <div class="input-wrap prefix">${icon('phone')}<span class="prefix-txt">+91</span><input class="input" name="phone" inputmode="numeric" maxlength="10" value="${phone}"></div>
          <input class="input otp-input hidden" name="code" inputmode="numeric" maxlength="6" placeholder="••••••">
          <p class="demo-otp hidden" id="lp-demo"></p>
          <p class="form-error" id="lp-error"></p>
        </form>`),
      actions: [
        { label: 'Cancel', value: null, variant: 'btn-ghost' },
        {
          label: 'Send OTP',
          onClick: async (wrap, close, btn) => {
            const form = wrap.querySelector('#lp-form');
            const err = wrap.querySelector('#lp-error');
            err.textContent = '';
            try {
              if (!confirmation) {
                phone = form.phone.value.replace(/\D/g, '');
                if (!/^[6-9]\d{9}$/.test(phone)) { err.textContent = 'Enter a valid 10-digit number.'; return true; }
                setBusy(btn, true, 'Sending…');
                verifier = verifier || createRecaptcha(holder);
                confirmation = await sendLinkOtp(phone, verifier);
                setBusy(btn, false);
                btn.textContent = 'Verify & link';
                form.code.classList.remove('hidden');
                form.code.focus();
                if (CONFIG.demoMode) {
                  const code = await fetchEmulatorOtp(phone).catch(() => null);
                  const demo = wrap.querySelector('#lp-demo');
                  demo.classList.remove('hidden');
                  demo.textContent = code ? `Demo OTP (emulator): ${code}` : 'Demo OTP not found';
                }
                return true;
              }
              setBusy(btn, true, 'Verifying…');
              await confirmation.confirm(form.code.value.trim());
              await user.reload();
              await user.getIdToken(true);                     // refresh token → phone_number claim
              await updateMyProfile(user.uid, { ...profile, phone, phoneVerified: true });
              toast('Mobile number linked ✅', 'success');
              return false;
            } catch (ex) {
              setBusy(btn, false);
              err.textContent = friendlyError(ex);
              return true;
            }
          },
        },
      ],
    }).result.finally(() => { try { verifier?.clear(); } catch { /* ignore */ } holder.remove(); });
  }

  d.add(store.subscribe(() => render()));

  d.add(on(el, 'submit', '#profile-form', async (e, form) => {
    e.preventDefault();
    const v = readForm(form);
    const err = $('#p-error', el);
    err.textContent = '';
    const { user, profile } = store.get();
    if (v.name.length < 2) { err.textContent = 'Name is too short.'; return; }
    if (v.phone && !/^[6-9]\d{9}$/.test(v.phone)) { err.textContent = 'Enter a valid 10-digit mobile number.'; return; }
    if (v.ffUid && !/^\d{5,15}$/.test(v.ffUid)) { err.textContent = 'FF Player ID must be 5–15 digits.'; return; }
    const btn = $('#p-save', el);
    setBusy(btn, true, 'Saving…');
    try {
      await updateMyProfile(user.uid, { ...v, phoneVerified: v.phone === profile.phone ? profile.phoneVerified : false });
      toast('Profile updated', 'success');
    } catch (ex) {
      err.textContent = friendlyError(ex);
      setBusy(btn, false);
    }
  }));
  d.add(on(el, 'click', '#link-phone', () => linkPhoneFlow()));
  d.add(on(el, 'click', '#reset-pass', async () => {
    const { user } = store.get();
    try { await sendResetEmail(user.email); toast(`Password reset link sent to ${user.email}`, 'success', 4000); } catch (ex) { toast(friendlyError(ex), 'error'); }
  }));
  d.add(on(el, 'click', '#logout', async () => {
    if (await confirmDialog({ title: 'Log out?', message: 'You can log back in anytime.', confirmText: 'Log out', danger: true })) await logout();
  }));
  return () => d.run();
}
