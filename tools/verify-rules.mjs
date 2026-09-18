/**
 * LIVE RULES VERIFICATION  (npm run verify:rules)
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS: the Firestore emulator needs Java, and this machine does not
 * have it. So instead of simulating the rules, this script attacks your REAL
 * project the way a curious participant with DevTools would, and asserts that
 * every hostile write is refused.
 *
 * Run it against a TEST project first, then once against production before the
 * doors open. It creates at most one throwaway result document.
 *
 * Requires in .env.local:  VITE_FIREBASE_* , and optionally
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD   (to clean up after itself)
 */
import process from 'node:process';
import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* fine */
}

const emailDomain = process.env.VITE_ROLL_EMAIL_DOMAIN || 'hvai.event';
const ROLL = process.env.VERIFY_ROLL || 'ZZVERIFY';
const OTHER_ROLL = 'ZZOTHER';

const config = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

if (!config.apiKey || !config.projectId) {
  console.error('MISSING Firebase web config. Fill .env.local first.');
  process.exit(1);
}

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

let failures = 0;
let checks = 0;

async function expect(label, fn, shouldSucceed) {
  checks += 1;
  try {
    await fn();
    if (shouldSucceed) {
      console.log(`  PASS  ${label} (allowed, as expected)`);
    } else {
      failures += 1;
      console.log(`  FAIL  ${label} — THIS WRITE WAS ALLOWED AND SHOULD NOT HAVE BEEN`);
    }
  } catch (error) {
    const code = String(error.code || '');
    if (shouldSucceed) {
      failures += 1;
      console.log(`  FAIL  ${label} — blocked (${code}) but should have been allowed`);
    } else if (code.includes('permission-denied')) {
      console.log(`  PASS  ${label} (blocked)`);
    } else {
      failures += 1;
      console.log(`  FAIL  ${label} — unexpected error ${code}: ${error.message}`);
    }
  }
}

async function main() {
  console.log(`project: ${config.projectId}`);
  console.log('\n=== 1. as an UNAUTHENTICATED visitor ===');
  await expect('read eventState/main', () => setDoc(doc(db, 'eventState', 'main'), { hacked: true }), false);

  console.log('\n=== 2. sign in / create a throwaway participant ===');
  const email = `${ROLL.toLowerCase()}@${emailDomain}`;
  let user = null;
  try {
    user = (await signInWithEmailAndPassword(auth, email, 'verifypass123')).user;
    console.log(`  signed in as ${ROLL}`);
  } catch {
    user = (await createUserWithEmailAndPassword(auth, email, 'verifypass123')).user;
    console.log(`  created ${ROLL}`);
  }
  await expect(
    'create own participants document',
    () =>
      setDoc(doc(db, 'participants', ROLL), {
        rollNumber: ROLL,
        name: 'Rules Verifier',
        uid: user.uid,
        rebindAllowed: false,
        status: 'ACTIVE',
        totalScore: 0,
        completedCount: 0,
        passedCount: 0,
        failedCount: 0,
        completed: {},
        createdAt: serverTimestamp(),
        updatedAt: Date.now(),
      }),
    true
  );

  console.log('\n=== 3. hostile writes that MUST be refused ===');
  await expect(
    'write the global battle bar',
    () => setDoc(doc(db, 'eventState', 'main'), { humanPower: 100, aiPower: 0 }, { merge: true }),
    false
  );
  await expect(
    'set humanPower to 95 (outside the 54-92 band)',
    () => updateDoc(doc(db, 'eventState', 'main'), { humanPower: 95, aiPower: 5 }),
    false
  );
  await expect('edit battle tuning config/event', () => setDoc(doc(db, 'config', 'event'), { baseHuman: 5 }), false);
  await expect('read the judge PIN document', () => setDoc(doc(db, 'config', 'judgePin'), { salt: 'x' }), false);
  await expect(
    "inflate another participant's score",
    () => updateDoc(doc(db, 'participants', OTHER_ROLL), { totalScore: 9999 }),
    false
  );
  await expect(
    'promote myself to admin',
    () => setDoc(doc(db, 'admins', user.uid), { role: 'admin' }),
    false
  );
  await expect(
    "write another participant's result",
    () =>
      setDoc(doc(db, 'progress', `${OTHER_ROLL}_captcha`), {
        rollId: OTHER_ROLL,
        activityId: 'captcha',
        success: true,
        score: 100,
        judgeId: 'Sathvik',
        uid: user.uid,
        createdAt: serverTimestamp(),
      }),
    false
  );
  await expect(
    'write a result with an invented judge name',
    () =>
      setDoc(doc(db, 'progress', `${ROLL}_captcha`), {
        rollId: ROLL,
        activityId: 'captcha',
        success: true,
        score: 100,
        judgeId: 'NOT A JUDGE',
        uid: user.uid,
        createdAt: serverTimestamp(),
      }),
    false
  );
  await expect(
    'write into another participant document',
    () => setDoc(doc(db, 'participants', OTHER_ROLL), { totalScore: 1 }),
    false
  );
  await expect(
    'write an arbitrary submissions document',
    () => setDoc(doc(db, 'submissions', 'hack'), { x: 1 }),
    false
  );
  await expect('write an audit entry', () => setDoc(doc(db, 'audit', 'hack'), { action: 'HACK' }), false);

  console.log('\n=== 4. legitimate writes that MUST be allowed ===');
  await expect(
    'submit my own first result (the exact shape the app writes)',
    () =>
      setDoc(doc(db, 'progress', `${ROLL}_captcha`), {
        rollId: ROLL,
        rollNumber: ROLL,
        participantName: 'Rules Verifier',
        activityId: 'captcha',
        activityName: 'OFFLINE CAPTCHA',
        success: true,
        score: 70,
        metricLabel: '00:32',
        timeMs: 32000,
        penalty: null,
        difficulty: 'NORMAL',
        judgeId: 'Sathvik',
        pinVersion: 1,
        uid: user.uid,
        createdAt: serverTimestamp(),
      }),
    true
  );

  console.log('\n=== 5. the duplicate guard (the whole point) ===');
  await expect(
    'submit the SAME challenge a second time',
    () =>
      setDoc(doc(db, 'progress', `${ROLL}_captcha`), {
        rollId: ROLL,
        rollNumber: ROLL,
        activityId: 'captcha',
        success: true,
        score: 999,
        judgeId: 'Sathvik',
        uid: user.uid,
        createdAt: serverTimestamp(),
      }),
    false
  );
  await expect(
    'rewrite my own recorded result',
    () => updateDoc(doc(db, 'progress', `${ROLL}_captcha`), { score: 10000 }),
    false
  );
  await expect(
    'delete my own recorded result',
    () => deleteDoc(doc(db, 'progress', `${ROLL}_captcha`)),
    false
  );

  console.log('\n=== 6. cleanup ===');
  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
    await signOut(auth);
    await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
    await deleteDoc(doc(db, 'progress', `${ROLL}_captcha`));
    await deleteDoc(doc(db, 'participants', ROLL));
    console.log('  cleaned up the verifier result + participant document (admin session).');
  } else {
    console.log('  SKIPPED: no admin credentials in .env.local.');
    console.log(`  Delete progress/${ROLL}_captcha and participants/${ROLL} by hand.`);
  }

  console.log(`\n${failures === 0 ? 'ALL GREEN' : 'FAILURES PRESENT'}: ${checks - failures}/${checks} checks passed.`);
  console.log(
    failures === 0
      ? 'Security rules behave as designed. Ready for the event.'
      : 'Do NOT run the event with these rules.'
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('VERIFY FAILED:', error.code || '', error.message || error);
  process.exit(1);
});