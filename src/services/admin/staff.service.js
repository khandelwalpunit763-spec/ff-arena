// Staff / Co-Admin management (Super Admin only – enforced by rules).
import { initializeApp, deleteApp } from 'firebase/app';
import {
  initializeAuth, inMemoryPersistence, connectAuthEmulator, createUserWithEmailAndPassword,
  updateProfile, signOut, sendPasswordResetEmail,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, query, where, getDocs,
  limit, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { fb } from '../../shared/firebase.js';
import { CONFIG } from '../../shared/config.js';
import { AppError } from '../../shared/errors.js';
import { DEFAULT_APP_CONFIG } from '../../shared/constants.js';

const withId = (s) => ({ id: s.id, ...s.data() });

export async function getStaffProfile(uid) {
  const s = await getDoc(doc(fb().db, 'staff', uid));
  return s.exists() ? withId(s) : null;
}

export function listenStaffProfile(uid, cb, onError) {
  return onSnapshot(doc(fb().db, 'staff', uid), (s) => cb(s.exists() ? withId(s) : null), onError);
}

export function listenAllStaff(cb, onError) {
  return onSnapshot(collection(fb().db, 'staff'), (snap) => {
    const list = snap.docs.map(withId).sort((a, b) => (a.role === 'super' ? -1 : 1) - (b.role === 'super' ? -1 : 1) || a.name.localeCompare(b.name));
    cb(list);
  }, onError);
}

/**
 * Creates a brand-new staff login WITHOUT logging the Super Admin out:
 * a temporary secondary Firebase app (in-memory session) creates the auth user.
 */
export async function createStaffAccount({ name, email, password, role = 'staff', perms = {} }, me) {
  const tmp = initializeApp(CONFIG.firebase, `staff-creator-${Date.now()}`);
  try {
    const tmpAuth = initializeAuth(tmp, { persistence: inMemoryPersistence });
    if (CONFIG.emulator) connectAuthEmulator(tmpAuth, window.location.origin, { disableWarnings: true });
    const cred = await createUserWithEmailAndPassword(tmpAuth, email.trim(), password);
    await updateProfile(cred.user, { displayName: name });
    await signOut(tmpAuth);
    await setStaffDoc(cred.user.uid, { name, email: email.trim(), role, perms }, me);
    return cred.user.uid;
  } finally {
    await deleteApp(tmp).catch(() => {});
  }
}

/** Promote an existing player account (found by e-mail) to staff. */
export async function promoteExistingUser({ email, name, role = 'staff', perms = {} }, me) {
  const snap = await getDocs(query(collection(fb().db, 'users'), where('email', '==', email.trim()), limit(1)));
  if (snap.empty) throw new AppError('NOT_FOUND', 'No player account found with this e-mail.');
  const u = snap.docs[0].data();
  await setStaffDoc(u.uid, { name: name || u.name, email: u.email, role, perms }, me);
  return u.uid;
}

async function setStaffDoc(uid, { name, email, role, perms }, me) {
  await setDoc(doc(fb().db, 'staff', uid), {
    uid,
    name: String(name).trim().slice(0, 40),
    email,
    role,
    active: true,
    perms: { deposits: Boolean(perms.deposits) },
    createdAt: serverTimestamp(),
    createdBy: me.uid,
  });
}

export async function updateStaff(uid, patch) {
  await updateDoc(doc(fb().db, 'staff', uid), { ...patch, updatedAt: serverTimestamp() });
}

export async function removeStaff(uid) {
  await deleteDoc(doc(fb().db, 'staff', uid));
}

export async function sendStaffPasswordReset(email) {
  await sendPasswordResetEmail(fb().auth, email);
}

/** First-run: the bootstrap owner e-mail (see firestore.rules) claims the Super Admin seat. */
export async function claimSuperAdmin(user, name) {
  const { db } = fb();
  const batch = writeBatch(db);
  batch.set(doc(db, 'staff', user.uid), {
    uid: user.uid, name: String(name).trim().slice(0, 40), email: user.email, role: 'super', active: true,
    perms: { deposits: true }, createdAt: serverTimestamp(), createdBy: user.uid,
  });
  batch.set(doc(db, 'config', 'app'), { ...DEFAULT_APP_CONFIG, createdAt: serverTimestamp() });
  await batch.commit();
}
