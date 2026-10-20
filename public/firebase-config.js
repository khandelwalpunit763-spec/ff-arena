/*
 * ─────────────────────────────────────────────────────────────────────────────
 *  FF ARENA – runtime configuration
 *  1. Firebase Console → Project settings → General → "Your apps" → Web app → Config
 *  2. Paste the values below. No rebuild needed (works inside HopWeb / Cordova too).
 * ─────────────────────────────────────────────────────────────────────────────
 */
window.FF_CONFIG = {
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:0000000000000000"
  },
  // Region where you deploy the optional payment Cloud Functions (functions/index.js)
  functionsRegion: "asia-south1",
  // Local development against the Firebase Emulator Suite (npm run serve -- --demo)
  emulator: false,
  demoMode: false,
  brand: {
    name: "FF Arena",
    tagline: "Play • Win • Withdraw"
  }
};
