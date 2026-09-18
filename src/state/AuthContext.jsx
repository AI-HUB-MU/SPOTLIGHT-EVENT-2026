import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, ROLL_EMAIL_DOMAIN } from '../firebase/config.js';
import { errorText, normalizeRoll, rollIsValid } from '../lib/util.js';

/**
 * PARTICIPANT IDENTITY
 * --------------------
 * Firebase Auth needs an email-shaped identifier. We synthesise one from the
 * roll number and never use that address again:
 *
 *      23XXXX  ->  23xxxx@hvai.event
 *
 * So the roll number is unique by construction (Firebase refuses a duplicate
 * email), and participants/{ROLL} uses the roll number as the document id, so
 * the same uniqueness holds in Firestore. Passwords are hashed by Firebase
 * Auth: a plaintext password never reaches Firestore and cannot be read back,
 * not even by the admin.
 */

const AuthContext = createContext(null);

const CREDENTIAL_FAILURES = new Set([
  'auth/invalid-credential',
  'auth/user-not-found',
  'auth/wrong-password',
  'auth/invalid-login-credentials',
]);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [isAdmin, setIsAdmin] = useState(null); // null = still checking
  const [participant, setParticipant] = useState(null);
  const [participantReady, setParticipantReady] = useState(false);
  const [problem, setProblem] = useState('');

  // ------------------------------------------------------------- auth state
  useEffect(() => {
    if (!auth) return undefined;
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setIsAdmin(null);
        setParticipant(null);
        setParticipantReady(false);
      }
    });
    return () => unsub();
  }, []);

  // -------------------------------------------------------- admin detection
  // Rules allow reading your own admins/{uid} document, so this is cheap - and
  // it also tells us NOT to subscribe to a participant document for admins.
  useEffect(() => {
    let cancelled = false;
    if (!db || !user) {
      setIsAdmin(null);
      return () => {
        cancelled = true;
      };
    }
    setIsAdmin(null);
    getDoc(doc(db, 'admins', user.uid))
      .then((snap) => {
        if (!cancelled) setIsAdmin(snap.exists());
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ------------------------------------------------- participant live record
  useEffect(() => {
    if (!db || !user || isAdmin !== false) {
      setParticipantReady(isAdmin !== null || !user);
      return undefined;
    }
    const rollId = normalizeRoll(String(user.email || '').split('@')[0]);
    setParticipantReady(false);
    const unsub = onSnapshot(
      doc(db, 'participants', rollId),
      (snap) => {
        setParticipant(snap.exists() ? { rollId, ...snap.data() } : { rollId, missing: true });
        setParticipantReady(true);
      },
      (error) => {
        setProblem(errorText(error));
        setParticipantReady(true);
      }
    );
    return () => unsub();
  }, [user, isAdmin]);
// ------------------------------------------------------------------ login
  const loginAsParticipant = useCallback(async ({ name, roll, password }) => {
    if (!auth || !db) return { ok: false, message: 'Firebase is not configured yet.' };

    const rollId = normalizeRoll(roll);
    if (!rollIsValid(rollId)) return { ok: false, message: 'ROLL NUMBER MUST BE 3-20 LETTERS / DIGITS.' };
    if (String(password || '').length < 6) {
      return { ok: false, message: 'PASSWORD MUST BE AT LEAST 6 CHARACTERS.' };
    }
    const cleanName = String(name || '').trim().slice(0, 40);
    if (cleanName.length < 2) return { ok: false, message: 'ENTER YOUR NAME.' };

    const email = `${rollId.toLowerCase()}@${ROLL_EMAIL_DOMAIN}`;
    let cred = null;

    try {
      cred = await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (!CREDENTIAL_FAILURES.has(error.code)) return { ok: false, message: errorText(error) };
      // Firebase deliberately does not tell us whether the account exists, so
      // we try to register. "email-already-in-use" then means: wrong password.
      try {
        cred = await createUserWithEmailAndPassword(auth, email, password);
      } catch (registerError) {
        if (registerError.code === 'auth/email-already-in-use') {
          return {
            ok: false,
            message:
              'THIS ROLL NUMBER IS ALREADY REGISTERED — WRONG PASSWORD. If you forgot it, ask the admin to unlock your roll number.',
          };
        }
        return { ok: false, message: errorText(registerError) };
      }
    }

    const uid = cred.user.uid;
    const ref = doc(db, 'participants', rollId);

    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          rollNumber: rollId,
          name: cleanName,
          uid,
          rebindAllowed: false,
          status: 'ACTIVE',
          totalScore: 0,
          completedCount: 0,
          passedCount: 0,
          failedCount: 0,
          completed: {},
          createdAt: serverTimestamp(),
          updatedAt: Date.now(),
        });
      } else {
        const data = snap.data();
        if (data.uid !== uid) {
          if (data.rebindAllowed) {
            // Admin unlocked this roll number (forgot-password recovery).
            await updateDoc(ref, { uid, rebindAllowed: false, updatedAt: Date.now() });
          } else {
            await signOut(auth);
            return {
              ok: false,
              message:
                'THIS ROLL NUMBER IS LOCKED TO ANOTHER ACCOUNT. Ask the admin to unlock it, or check your password.',
            };
          }
        }
      }
      return { ok: true, message: 'ACCESS GRANTED' };
    } catch (error) {
      return { ok: false, message: errorText(error) };
    }
  }, []);

  // ------------------------------------------------------------ admin login
  const loginAsAdmin = useCallback(async ({ email, password }) => {
    if (!auth || !db) return { ok: false, message: 'Firebase is not configured yet.' };
    try {
      const cred = await signInWithEmailAndPassword(auth, String(email || '').trim(), password);
      const adminSnap = await getDoc(doc(db, 'admins', cred.user.uid));
      if (!adminSnap.exists()) {
        await signOut(auth);
        return { ok: false, message: 'THAT ACCOUNT IS NOT AN ADMIN.' };
      }
      return { ok: true, message: 'COMMAND CENTRE ONLINE' };
    } catch (error) {
      return { ok: false, message: errorText(error) };
    }
  }, []);

  const logout = useCallback(async () => {
    if (auth) await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({
      user,
      uid: user ? user.uid : null,
      authReady,
      isAdmin,
      participant,
      participantReady,
      rollId: participant ? participant.rollId : null,
      problem,
      loginAsParticipant,
      loginAsAdmin,
      logout,
    }),
    [user, authReady, isAdmin, participant, participantReady, problem, loginAsParticipant, loginAsAdmin, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}