// Player-app singletons: global store + navigation helpers (kept separate to avoid import cycles).
import { createStore } from '../shared/store.js';
import { DEFAULT_APP_CONFIG } from '../shared/constants.js';

export const store = createStore({
  authReady: false,
  user: null,
  profile: null,
  wallet: null,
  config: DEFAULT_APP_CONFIG,
  entries: new Map(),        // matchId → my player entry
});

let router = null;
export const setRouter = (r) => { router = r; };
export const go = (path, opts) => router.navigate(path, opts);
export const back = (fallback = '/home') => router.back(fallback);
export const currentRoute = () => router?.current();

export const walletTotal = (w) => (w ? Number(w.deposit || 0) + Number(w.winning || 0) : 0);
