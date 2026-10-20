// Firebase bootstrap (modular SDK v13). One place that knows about emulators, persistence
// and Cordova/WebView quirks. Every service reads the live instances through `fb()`.

import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
} from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { CONFIG } from './config.js';

let ctx = null;

/**
 * @param {{ appName?: string }} opts  Use a different appName for the Admin panel so that
 *        the staff session and the player session never overwrite each other.
 */
export function initFirebase({ appName = '[DEFAULT]' } = {}) {
  if (ctx) return ctx;
  const existing = getApps().find((a) => a.name === appName);
  const app = existing || initializeApp(CONFIG.firebase, appName);

  // initializeAuth (instead of getAuth) avoids loading the popup/redirect iframe,
  // which breaks inside Cordova / HopWeb WebViews.
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  });

  let db;
  if (CONFIG.emulator) {
    // The dev server (scripts/serve.mjs) proxies the emulator REST endpoints on the SAME
    // origin, so this works on localhost and behind any HTTPS preview URL.
    connectAuthEmulator(auth, window.location.origin, { disableWarnings: true });
    db = initializeFirestore(app, {
      host: window.location.host,
      ssl: window.location.protocol === 'https:',
      experimentalForceLongPolling: true,
    });
  } else {
    db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  }

  ctx = { app, auth, db, appName };
  return ctx;
}

/** Inject a custom context (used by automated tests). */
export function setFirebaseContext(custom) {
  ctx = custom;
}

export function fb() {
  if (!ctx) throw new Error('Firebase not initialised – call initFirebase() first.');
  return ctx;
}

/** Default identity for service calls: { db, uid } of the signed-in user. */
export function session() {
  const { db, auth } = fb();
  return { db, uid: auth?.currentUser?.uid || null, user: auth?.currentUser || null };
}
