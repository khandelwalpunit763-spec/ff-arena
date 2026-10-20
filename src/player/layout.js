// App shell: top bar (brand / back / wallet chip) + bottom navigation.
import { html, $, setHTML } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { inr } from '../shared/format.js';
import { CONFIG } from '../shared/config.js';
import { store, back, walletTotal } from './app.js';

const TABS = [
  { id: 'home', label: 'Home', href: '#/home', icon: 'home' },
  { id: 'my', label: 'My Matches', href: '#/my-matches', icon: 'trophy' },
  { id: 'wallet', label: 'Wallet', href: '#/wallet', icon: 'wallet' },
  { id: 'profile', label: 'Profile', href: '#/profile', icon: 'user' },
];

export function renderShell(root) {
  setHTML(root, html`
    <div class="app-shell">
      <header class="topbar" id="topbar">
        <button class="icon-btn back-btn" id="back-btn" aria-label="Back">${icon('chevronLeft')}</button>
        <a class="brand" href="#/home" id="brand">
          <span class="brand-mark">${icon('flame')}</span>
          <span class="brand-name">${CONFIG.brand.name}</span>
        </a>
        <h1 class="topbar-title" id="topbar-title"></h1>
        <a class="wallet-chip" href="#/wallet" id="wallet-chip">${icon('wallet')}<span id="wallet-chip-amt">₹0</span></a>
      </header>
      ${CONFIG.demoMode ? html`<div class="demo-ribbon">DEMO · Firebase Emulator</div>` : ''}
      <main id="view" class="view"></main>
      <nav class="bottomnav" id="bottomnav">
        ${TABS.map((t) => html`<a href="${t.href}" class="nav-item" data-tab="${t.id}">${icon(t.icon)}<span>${t.label}</span></a>`)}
      </nav>
    </div>`);

  $('#back-btn').addEventListener('click', () => back());
  store.subscribe((s) => {
    const el = $('#wallet-chip-amt');
    if (el) el.textContent = inr(walletTotal(s.wallet));
  });
}

export function updateShell(route) {
  document.body.classList.toggle('no-shell', route.shell === false);
  document.body.classList.toggle('has-back', Boolean(route.back));
  $('#topbar-title').textContent = route.title || '';
  document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.tab === route.tab));
  document.title = `${route.title ? `${route.title} · ` : ''}${CONFIG.brand.name}`;
}
