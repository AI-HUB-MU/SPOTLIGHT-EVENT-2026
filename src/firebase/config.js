import { initializeApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** True when .env.local has been filled in. The app shows a setup screen if not. */
export const CONFIG_MISSING =
  !firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId;

/**
 * Participants type a roll number, Firebase Auth needs an email-shaped identity.
 * "23XXXX" -> "23xxxx@hvai.event". The domain is never contacted or verified.
 * Change it here if Firebase ever rejects it (any plausible domain works).
 */
export const ROLL_EMAIL_DOMAIN = env.VITE_ROLL_EMAIL_DOMAIN || 'hvai.event';

let app = null;
let auth = null;
let db = null;

if (!CONFIG_MISSING) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);

  // Participants must stay logged in across refreshes / screen locks.
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('[auth] persistence unavailable', err);
  });

  // Offline read cache: survives a refresh on flaky Wi-Fi and saves quota.
  // Falls back to the in-memory cache if IndexedDB is unavailable (private mode).
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.warn('[firestore] persistent cache unavailable, using memory cache', err);
    db = getFirestore(app);
  }
}

export { app, auth, db };
