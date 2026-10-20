// App settings (Super Admin only – rules: /config/{doc} write → isSuper()).
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { fb } from '../../shared/firebase.js';

export async function saveAppConfig(patch) {
  await setDoc(doc(fb().db, 'config', 'app'), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}
