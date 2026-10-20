// PLAYER APP entry point
import { initFirebase } from '../shared/firebase.js';
import { CONFIG, isFirebaseConfigured } from '../shared/config.js';
import { createRouter } from '../shared/router.js';
import { html, setHTML, $ } from '../shared/dom.js';
import { startCountdownTicker } from '../shared/ui.js';
import { watchAuth, ensureUserDocs } from '../services/auth.service.js';
import { listenProfile, listenAppConfig } from '../services/user.service.js';
import { listenWallet } from '../services/wallet.service.js';
import { listenMyEntries } from '../services/match.service.js';
import { store, setRouter } from './app.js';
import { renderShell, updateShell } from './layout.js';

import LoginScreen from './screens/auth-login.js';
import SignupScreen from './screens/auth-signup.js';
import ForgotScreen from './screens/auth-forgot.js';
import HomeScreen from './screens/home.js';
import MatchDetailScreen from './screens/match-detail.js';
import JoinScreen from './screens/join-match.js';
import MyMatchesScreen from './screens/my-matches.js';
import WalletScreen from './screens/wallet.js';
import AddMoneyScreen from './screens/add-money.js';
import WithdrawScreen from './screens/withdraw.js';
import ProfileScreen from './screens/profile.js';

const routes = [
  { path: '/login', screen: LoginScreen, guest: true, shell: false, title: 'Login' },
  { path: '/signup', screen: SignupScreen, guest: true, shell: false, title: 'Sign up' },
  { path: '/forgot', screen: ForgotScreen, shell: false, stable: true, title: 'Forgot password' },
  { path: '/home', screen: HomeScreen, auth: true, tab: 'home' },
  { path: '/match/:id', screen: MatchDetailScreen, auth: true, tab: 'home', back: true, title: 'Match details' },
  { path: '/join/:id', screen: JoinScreen, auth: true, tab: 'home', back: true, title: 'Join match' },
  { path: '/my-matches', screen: MyMatchesScreen, auth: true, tab: 'my', title: '' },
  { path: '/wallet', screen: WalletScreen, auth: true, tab: 'wallet', title: '' },
  { path: '/wallet/add', screen: AddMoneyScreen, auth: true, tab: 'wallet', back: true, title: 'Add money' },
  { path: '/wallet/withdraw', screen: WithdrawScreen, auth: true, tab: 'wallet', back: true, title: 'Withdraw' },
  { path: '/profile', screen: ProfileScreen, auth: true, tab: 'profile', title: '' },
];

function notConfigured(root) {
  setHTML(root, html`
    <div class="setup-screen">
      <h1>🔥 Almost there!</h1>
      <p>Add your Firebase web config to <code>firebase-config.js</code> (Firebase Console → Project settings → Your apps → Web app).</p>
      <p class="muted">See README.md → "Connect your Firebase project".</p>
    </div>`);
}

function boot() {
  const root = document.getElementById('app');
  if (!isFirebaseConfigured()) { notConfigured(root); return; }
  initFirebase();
  renderShell(root);
  startCountdownTicker();

  const router = createRouter({
    routes,
    outlet: $('#view'),
    fallback: '/home',
    onChange: updateShell,
    guard: (route) => {
      const { user } = store.get();
      if (route.auth && !user) return '/login';
      if (route.guest && user) return '/home';
      return null;
    },
  });
  setRouter(router);

  listenAppConfig((config) => store.set({ config }), (e) => console.warn('config', e));

  let unsubs = [];
  watchAuth(async (user) => {
    unsubs.forEach((fn) => fn());
    unsubs = [];
    store.set({ user, profile: null, wallet: null, entries: new Map() });
    if (user) {
      try { await ensureUserDocs(user); } catch (e) { console.warn('ensureUserDocs', e); }
      unsubs.push(listenProfile(user.uid, (profile) => store.set({ profile })));
      unsubs.push(listenWallet(user.uid, (wallet) => store.set({ wallet })));
      unsubs.push(listenMyEntries(user.uid, (list) => store.set({ entries: new Map(list.map((e) => [e.matchId, e])) }), (e) => console.warn('entries', e)));
    }
    if (!store.get().authReady) {
      store.set({ authReady: true });
      document.body.classList.remove('booting');
      router.start();
    } else if (!router.current()?.stable) {
      router.refresh();
    }
  });
}

if (CONFIG.demoMode) console.info('%cFF Arena demo mode – connected to Firebase Emulator Suite', 'color:#ff7a18');
boot();
