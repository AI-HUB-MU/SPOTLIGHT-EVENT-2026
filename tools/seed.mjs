/**
 * SEEDER  (npm run seed -- <JUDGE_PIN> [PARTICIPANT_COUNT])
 * ---------------------------------------------------------------------------
 * Signs in as your admin account and writes the two config documents the app
 * needs, so you never hand-edit Firestore during setup:
 *
 *   config/event     battle tuning (gains, base, drift, timers, AI creep)
 *   config/judgePin  { salt, pinHash, pinVersion }  <- never the code itself
 *
 * Optional: creates N throwaway test participants (TEST001..) for the dry run.
 *
 * Requires in .env.local:
 *   VITE_FIREBASE_*        (same values the app uses)
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
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
  getDoc,
} from 'firebase/firestore';
import { hashPin, newSalt } from '../src/lib/hash.js';
import { DEFAULT_EVENT_CONFIG, DEFAULT_EVENT_STATE } from '../src/lib/scoring.js';

try {
  process.loadEnvFile('.env.local');
} catch {
  console.log('note: no .env.local found, relying on real environment variables');
}

const pin = process.argv[2] || process.env.SEED_JUDGE_PIN || '';
const participantCount = Math.max(0, Math.min(60, Number(process.argv[3] || 0)));
const emailDomain = process.env.VITE_ROLL_EMAIL_DOMAIN || 'hvai.event';

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
if (!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD) {
  console.error('MISSING SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env.local');
  process.exit(1);
}

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  const cred = await signInWithEmailAndPassword(
    auth,
    process.env.SEED_ADMIN_EMAIL,
    process.env.SEED_ADMIN_PASSWORD
  );
  console.log(`signed in as ${cred.user.email} (uid ${cred.user.uid})`);

  const adminSnap = await getDoc(doc(db, 'admins', cred.user.uid));
  if (!adminSnap.exists()) {
    console.log('');
    console.log('!! admins/' + cred.user.uid + ' DOES NOT EXIST.');
    console.log('!! Create it in the Firestore console before the event:');
    console.log(`!!   collection: admins   document id: ${cred.user.uid}`);
    console.log('!!   fields: { role: "admin" }');
    console.log('');
  } else {
    console.log('admin document present.');
  }

  // ------------------------------------------------ config/event (tuning)
  await setDoc(
    doc(db, 'config', 'event'),
    { ...DEFAULT_EVENT_CONFIG, updatedAt: Date.now() },
    { merge: true }
  );
  console.log('config/event written (battle tuning).');

  // ------------------------------------------------ config/judgePin
  if (pin) {
    const salt = newSalt();
    const pinHash = hashPin(salt, pin);
    const existing = await getDoc(doc(db, 'config', 'judgePin'));
    const pinVersion = (existing.exists() ? Number(existing.data().pinVersion) || 0 : 0) + 1;
    await setDoc(doc(db, 'config', 'judgePin'), {
      salt,
      pinHash,
      pinVersion,
      updatedAt: Date.now(),
      updatedBy: cred.user.email,
    });
    console.log(`config/judgePin written (version ${pinVersion}). Tell all six judges the code.`);
  } else {
    console.log('config/judgePin skipped (no PIN argument). Set it from the admin console instead.');
  }

  // ------------------------------------------- the global bar, if missing
  const stateSnap = await getDoc(doc(db, 'eventState', 'main'));
  if (!stateSnap.exists()) {
    await setDoc(doc(db, 'eventState', 'main'), { ...DEFAULT_EVENT_STATE, updatedAt: Date.now() });
    console.log(`eventState/main created at ${DEFAULT_EVENT_STATE.humanPower}% / ${DEFAULT_EVENT_STATE.aiPower}%.`);
  } else {
    console.log('eventState/main already exists (left untouched).');
  }

  // -------------------------------------- optional throwaway test competitors
  if (participantCount > 0) {
    await signOut(auth);
    console.log(`\ncreating ${participantCount} test participants (password: testpass123)…`);
    for (let i = 1; i <= participantCount; i += 1) {
      const rollId = `TEST${String(i).padStart(3, '0')}`;
      const email = `${rollId.toLowerCase()}@${emailDomain}`;
      try {
        const newUser = await createUserWithEmailAndPassword(auth, email, 'testpass123');
        await setDoc(doc(db, 'participants', rollId), {
          rollNumber: rollId,
          name: `Test Competitor ${i}`,
          uid: newUser.user.uid,
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
        await signOut(auth);
        process.stdout.write(`${rollId} `);
      } catch (error) {
        process.stdout.write(`\n${rollId} failed: ${error.code || error.message}\n`);
      }
    }
    console.log('\ntest participants ready.');
    await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  }

  console.log('\nSEED COMPLETE.');
  process.exit(0);
}

main().catch((error) => {
  console.error('SEED FAILED:', error.code || '', error.message || error);
  process.exit(1);
});
