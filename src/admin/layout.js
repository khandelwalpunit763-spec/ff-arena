// Admin shell: sidebar (role-aware) + top bar.
import { html, setHTML, $, on } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { initials } from '../shared/format.js';
import { CONFIG } from '../shared/config.js';
import { confirmDialog } from '../shared/ui.js';
import { logout } from '../services/auth.service.js';
import { store, isSuper, canVerifyDeposits } from './app.js';

function navItems() {
  const items = [
    { id: 'dashboard', href: '#/dashboard', icon: 'grid', label: 'Dashboard' },
    { id: 'create', href: '#/create', icon: 'plus', label: 'Create Match' },
    { id: 'matches', href: '#/matches', icon: 'trophy', label: isSuper() ? 'All Matches' : 'My Matches' },
  ];
  if (canVerifyDeposits()) items.push({ id: 'deposits', href: '#/deposits', icon: 'arrowDown', label: 'Deposits', section: 'Finance' });
  if (isSuper()) {
    items.push({ id: 'withdrawals', href: '#/withdrawals', icon: 'arrowUp', label: 'Withdrawals', section: canVerifyDeposits() ? null : 'Finance' });
    items.push({ id: 'staff', href: '#/staff', icon: 'shield', label: 'Staff & Roles', section: 'Super Admin' });
    items.push({ id: 'users', href: '#/users', icon: 'users', label: 'Players' });
    items.push({ id: 'settings', href: '#/settings', icon: 'settings', label: 'App Settings' });
  }
  return items;
}

export function renderAdminShell(root) {
  const { staff, user } = store.get();
  setHTML(root, html`
    <div class="admin-shell">
      <aside class="sidebar" id="sidebar">
        <div class="side-brand">
          <span class="brand-mark">${icon('flame')}</span>
          <div><span class="brand-name">${CONFIG.brand.name}</span><small>Staff Console</small></div>
        </div>
        <nav class="side-nav">
          ${navItems().map((n) => html`
            ${n.section ? html`<div class="side-section">${n.section}</div>` : ''}
            <a href="${n.href}" class="side-link" data-nav="${n.id}">${icon(n.icon)}<span>${n.label}</span></a>`)}
        </nav>
        <div class="side-foot">
          <div class="side-user">
            <div class="avatar sm">${initials(staff?.name)}</div>
            <div class="ellipsis"><b class="ellipsis">${staff?.name}</b><small class="ellipsis">${user?.email}</small></div>
          </div>
          <button class="btn btn-ghost btn-sm btn-block" id="admin-logout">${icon('logout')}<span>Log out</span></button>
        </div>
      </aside>
      <div class="side-scrim" id="side-scrim"></div>
      <div class="admin-main">
        <header class="admin-top">
          <button class="icon-btn menu-btn" id="menu-btn" aria-label="Menu">${icon('menu')}</button>
          <h1 id="admin-title">Dashboard</h1>
          <span class="spacer"></span>
          ${CONFIG.demoMode ? html`<span class="chip chip-staff">Demo · Emulator</span>` : ''}
          <span class="chip ${staff?.role === 'super' ? 'chip-super' : 'chip-staff'}">${icon(staff?.role === 'super' ? 'crown' : 'shield')}${staff?.role === 'super' ? 'Super Admin' : 'Staff'}</span>
          <a class="btn btn-ghost btn-sm" href="index.html" target="_blank" rel="noopener">${icon('external')}<span class="hide-sm">Player app</span></a>
        </header>
        <main id="admin-view" class="admin-view"></main>
      </div>
    </div>`);

  const close = () => document.body.classList.remove('side-open');
  $('#menu-btn').addEventListener('click', () => document.body.classList.toggle('side-open'));
  $('#side-scrim').addEventListener('click', close);
  on(root, 'click', '.side-link', close);
  $('#admin-logout').addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Log out?', confirmText: 'Log out', danger: true })) await logout();
  });
}

export function updateAdminShell(route) {
  document.body.classList.toggle('no-shell', route.shell === false);
  const title = $('#admin-title');
  if (title) title.textContent = route.title || '';
  document.querySelectorAll('.side-link').forEach((a) => a.classList.toggle('active', a.dataset.nav === route.nav));
  document.title = `${route.title || 'Staff'} · ${CONFIG.brand.name} Console`;
}
