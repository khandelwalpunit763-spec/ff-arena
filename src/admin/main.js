// ADMIN / STAFF PANEL entry point (separate Firebase app instance → separate session).
import { initFirebase } from '../shared/firebase.js';
import { CONFIG, isFirebaseConfigured } from '../shared/config.js';
import { createRouter } from '../shared/router.js';
import { html, setHTML, $ } from '../shared/dom.js';
import { startCountdownTicker } from '../shared/ui.js';
import { watchAuth, logout } from '../services/auth.service.js';
import { listenAppConfig } from '../services/user.service.js';
import { listenStaffProfile } from '../services/admin/staff.service.js';
import { store, setRouter, isSuper, canVerifyDeposits } from './app.js';
import { renderAdminShell, updateAdminShell } from './layout.js';

import AdminLoginScreen from './screens/login.js';
import SetupScreen from './screens/setup.js';
import DashboardScreen from './screens/dashboard.js';
import CreateMatchScreen from './screens/create-match.js';
import MatchesScreen from './screens/matches.js';
import MatchManageScreen from './screens/match-manage.js';
import { DepositsScreen, WithdrawalsScreen } from './screens/finance.js';
import StaffScreen from './screens/staff.js';
import UsersScreen from './screens/users.js';
import SettingsScreen from './screens/settings.js';

const routes = [
  { path: '/login', screen: AdminLoginScreen, shell: false, guest: true, title: 'Login' },
  { path: '/setup', screen: SetupScreen, shell: false, setup: true, title: 'Setup' },
  { path: '/dashboard', screen: DashboardScreen, nav: 'dashboard', title: 'Dashboard' },
  { path: '/create', screen: CreateMatchScreen, nav: 'create', title: 'Create Match' },
  { path: '/edit/:id', screen: CreateMatchScreen, nav: 'matches', title: 'Edit Match' },
  { path: '/matches', screen: MatchesScreen, nav: 'matches', title: 'Manage Matches' },
  { path: '/match/:id', screen: MatchManageScreen, nav: 'matches', title: 'Match Control' },
  { path: '/deposits', screen: DepositsScreen, nav: 'deposits', title: 'Deposits', perm: canVerifyDeposits },
  { path: '/withdrawals', screen: WithdrawalsScreen, nav: 'withdrawals', title: 'Withdrawals', perm: isSuper },
  { path: '/staff', screen: StaffScreen, nav: 'staff', title: 'Staff & Roles', perm: isSuper },
  { path: '/users', screen: UsersScreen, nav: 'users', title: 'Players', perm: isSuper },
  { path: '/settings', screen: SettingsScreen, nav: 'settings', title: 'App Settings', perm: isSuper },
];

function boot() {
  const root = document.getElementById('app');
  if (!isFirebaseConfigured()) {
    setHTML(root, html`<div class="setup-screen"><h1>🔥 Configure Firebase</h1><p>Paste your Firebase web config into <code>firebase-config.js</code>.</p></div>`);
    return;
  }
  initFirebase({ appName: 'ff-admin' });
  startCountdownTicker();

  // A single outlet element that we move between "bare" pages and the admin shell.
  const outlet = document.createElement('div');
  outlet.id = 'route-outlet';
  let shellKey = null;

  function mountOutlet(route) {
    if (route.shell === false) {
      if (shellKey !== null) { setHTML(root, ''); shellKey = null; }
      if (outlet.parentElement !== root) root.appendChild(outlet);
    } else {
      const s = store.get().staff;
      const key = JSON.stringify([s?.name, s?.role, s?.perms]);
      if (key !== shellKey) { renderAdminShell(root); shellKey = key; }
      const view = $('#admin-view');
      if (outlet.parentElement !== view) view.appendChild(outlet);
    }
    updateAdminShell(route);
  }

  const router = createRouter({
    routes,
    outlet,
    fallback: '/dashboard',
    onChange: mountOutlet,
    guard: (route) => {
      const { user, staff } = store.get();
      if (!user) return route.guest ? null : '/login';
      if (!staff) return route.setup ? null : '/setup';
      if (route.guest || route.setup) return '/dashboard';
      if (route.perm && !route.perm()) return '/dashboard';
      return null;
    },
  });
  setRouter(router);

  listenAppConfig((config, exists) => store.set({ config, configExists: exists }));

  let unsubStaff = null;
  let started = false;
  const start = () => {
    if (!started) { started = true; document.body.classList.remove('booting'); router.start(); } else router.refresh();
  };

  watchAuth((user) => {
    if (unsubStaff) { unsubStaff(); unsubStaff = null; }
    store.set({ user, staff: null });
    if (!user) { start(); return; }
    unsubStaff = listenStaffProfile(user.uid, async (staff) => {
      if (staff && !staff.active) {
        await logout();
        window.location.hash = '#/login?denied=1';
        return;
      }
      const prev = store.get().staff;
      store.set({ staff });
      if (!prev || !staff || prev.role !== staff.role || JSON.stringify(prev.perms) !== JSON.stringify(staff.perms)) start();
    }, () => { store.set({ staff: null }); start(); });
  });
}

if (CONFIG.demoMode) console.info('%cFF Arena Staff Console – demo mode (emulator)', 'color:#ff7a18');
boot();
