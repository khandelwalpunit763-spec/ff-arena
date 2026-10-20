// Runtime configuration – read from window.FF_CONFIG (www/firebase-config.js).
// Keeping config outside the bundle lets you change Firebase keys inside a HopWeb/Cordova
// project without rebuilding the JavaScript.

const raw = (typeof window !== 'undefined' && window.FF_CONFIG) || {};

export const CONFIG = {
  firebase: raw.firebase || {},
  emulator: Boolean(raw.emulator),            // true → Firebase Emulator Suite via same-origin proxy
  demoMode: Boolean(raw.demoMode),            // shows demo credentials + emulator OTP helper
  functionsRegion: raw.functionsRegion || 'asia-south1',
  brand: {
    name: 'FF Arena',
    tagline: 'Play • Win • Withdraw',
    ...(raw.brand || {}),
  },
  demoAccounts: raw.demoAccounts || { player: [], staff: [] },
};

export function isFirebaseConfigured() {
  const key = String(CONFIG.firebase.apiKey || '');
  return key.length > 0 && !key.startsWith('YOUR_');
}
