// Player profile + app configuration listeners.
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { fb } from '../shared/firebase.js';
import { DEFAULT_APP_CONFIG } from '../shared/constants.js';

export function listenProfile(uid, cb, onError) {
  return onSnapshot(doc(fb().db, 'users', uid), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), onError);
}

export async function updateMyProfile(uid, patch) {
  const allowed = {};
  ['name', 'phone', 'ign', 'ffUid', 'phoneVerified'].forEach((k) => {
    if (patch[k] !== undefined) allowed[k] = patch[k];
  });
  allowed.updatedAt = serverTimestamp();
  await updateDoc(doc(fb().db, 'users', uid), allowed);
}

export function mergeAppConfig(data) {
  const d = data || {};
  return {
    ...DEFAULT_APP_CONFIG,
    ...d,
    limits: { ...DEFAULT_APP_CONFIG.limits, ...(d.limits || {}) },
    features: { ...DEFAULT_APP_CONFIG.features, ...(d.features || {}) },
  };
}

export function listenAppConfig(cb, onError) {
  return onSnapshot(
    doc(fb().db, 'config', 'app'),
    (s) => cb(mergeAppConfig(s.exists() ? s.data() : null), s.exists()),
    onError,
  );
}
