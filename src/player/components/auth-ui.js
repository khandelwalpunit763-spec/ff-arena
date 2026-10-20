// Shared pieces for the auth screens.
import { html } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { CONFIG } from '../../shared/config.js';

export function authHero(title, subtitle) {
  return html`
    <div class="auth-hero">
      <div class="auth-logo">${icon('flame')}</div>
      <div class="auth-brand">${CONFIG.brand.name}</div>
      <div class="auth-tagline">${CONFIG.brand.tagline}</div>
      <h2>${title}</h2>
      <p class="muted">${subtitle}</p>
    </div>`;
}

export function passwordToggleHandler(e, btn) {
  const input = btn.parentElement.querySelector('input');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.innerHTML = String(icon(show ? 'eyeOff' : 'eye'));
}
