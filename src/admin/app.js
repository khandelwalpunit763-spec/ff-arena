// Admin-panel singletons: store + navigation helpers.
import { createStore } from '../shared/store.js';
import { DEFAULT_APP_CONFIG } from '../shared/constants.js';

export const store = createStore({
  authReady: false,
  user: null,
  staff: null,            // /staff/{uid} doc → { name, role: 'super'|'staff', active, perms }
  config: DEFAULT_APP_CONFIG,
  configExists: true,
});

let router = null;
export const setRouter = (r) => { router = r; };
export const go = (path, opts) => router.navigate(path, opts);
export const back = (fallback = '/dashboard') => router.back(fallback);

export const isSuper = () => store.get().staff?.role === 'super';
export const canVerifyDeposits = () => isSuper() || Boolean(store.get().staff?.perms?.deposits);
export const me = () => ({ uid: store.get().user?.uid, name: store.get().staff?.name });
