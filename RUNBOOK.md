# HUMANS vs AI — LIVE EVENT RUNBOOK

Built for the "HUMANS VS AN EVIL AI ROBOT" college competition.
**Priority order: RELIABILITY > FEATURES > VISUAL POLISH.**

---

## 0. WHAT THIS IS

A React + Vite single-page app on Firebase Hosting, backed by Cloud Firestore.
No custom backend, no Cloud Functions, no server to babysit.

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite 8 (plain JavaScript, HashRouter) |
| Data | Cloud Firestore (real-time `onSnapshot` everywhere) |
| Auth | Firebase Auth Email/Password — roll number mapped to a synthetic email |
| Hosting | Firebase Hosting |
| Security | `firestore.rules` (the only trusted compute in the system) |

```
src/
  firebase/config.js      app init, offline read cache, roll -> email mapping
  lib/submitResult.js     *** THE SUBMISSION TRANSACTION ***  one code path
  lib/scoring.js          battle-bar maths (pure, unit-tested)
  lib/admin.js            every privileged operation, each one audited
  lib/hash.js             pure-JS SHA-256 (works over plain http too)
  lib/useTimers.js        epoch-based stopwatch/countdown (refresh + lock proof)
  state/AuthContext.jsx   auth, roll-number identity, admin detection
  state/EventContext.jsx  eventState/main + config listeners (the live bar)
  screens/LoginScreen  HomeScreen  ParticipateScreen  PlayScreen  AdminScreen
  screens/panels/         the four judge evaluation panels
  screens/admin/          command-centre sub-components
tools/
  selftest.mjs            offline maths/hash proof           (npm run selftest)
  seed.mjs                writes config/event + config/judgePin (npm run seed)
  verify-rules.mjs        attacks the real project to prove the rules hold
firestore.rules           the security model (READ IT BEFORE THE EVENT)
```

---

## 1. HOUR 0 — FIREBASE SETUP (do this first, ~30 minutes)

1. **console.firebase.google.com** → Add project → name it (e.g. `hvai-event`).
2. **Enable Blaze (pay-as-you-go) + a budget alert.**
   Why: on the free Spark plan, Firestore **stops serving requests** when the
   daily read quota runs out. A hall full of phones reconnecting can approach
   that. Blaze keeps the same free quota but does not hard-fail mid-event.
   Set a budget alert at a low value so you find out by email, not by panic.
3. **Build → Authentication → Get started → Email/Password → ENABLE.**
   Leave "Email link" off. No verification, no OTP, no Google.
4. **Build → Firestore Database → Create database.**
   - Region: **asia-south1 (Mumbai)**. This is **permanent** — pick it now.
   - Start in **production mode** (rules are deployed from this repo).
5. **Project settings → Your apps → Web (`</>`)** → register the app → copy the
   config values into `.env.local` (see `.env.example`).
6. Create the **admin account**: Authentication → Users → Add user
   (email + password, e.g. `admin@yourdomain.com`).
7. Firestore → **Start collection `admins`** → document id = the admin's **UID**
   (copy it from the Authentication → Users table) → field `role` = `"admin"`.
   Without this document the admin console refuses to load. This is the
   bootstrap: it can only be created by hand or by another admin.
8. Install the CLI and deploy:

```powershell
npm install
npm i -g firebase-tools
firebase login
# edit .firebaserc -> "default": "your-project-id"
firebase use --add            # or: firebase use your-project-id
npm run build
firebase deploy --only hosting,firestore:rules,firestore:indexes
```

9. **Seed the config documents** (battle tuning + judge PIN):

```powershell
# add SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD to .env.local first
npm run seed -- YOURJUDGEPIN 12      # 12 optional throwaway test participants
```

10. **Verify the security rules** (see §4) and run a smoke test from a phone.

---

## 2. DAILY DEVELOPMENT

```powershell
npm run dev        # http://localhost:5173 , also on your LAN IP for phones
npm run build      # production bundle into dist/
npm run selftest   # 34 offline checks: hashes, bar maths, timers, parsing
npm run seed -- PIN [N]
npm run verify:rules
npm run deploy     # build + hosting + rules + indexes in ONE command
```

**Rule of thumb: always deploy hosting and rules together.** Drifting rules are
how you get a "works on my laptop, blocked at the venue" evening.

---

## 3. THE FOUR CHALLENGES

| # | Activity | id | Judge records | Ranking value |
|---|---|---|---|---|
| 01 | OFFLINE CAPTCHA | `captcha` | completed, time, difficulty, score | higher score wins |
| 02 | COMPETITIVE CONSOLES | `consoles` | race timer, success/failure, penalty, score | **lower time wins** |
| 03 | TURING TIME | `turing` | 3 rounds vs the answer key, pass mark 2/3 | most correct |
| 04 | HELLO, CAN YOU HEAR ME? | `hearing` | 30–45 s timer, answer, correct?, score | higher score wins |

Every leaderboard is derived from the same `progress` collection in memory, so
**no composite Firestore indexes are needed** — one less thing that can be
"still building" at exactly the wrong moment.

### Participant flow
login (name / roll / password) → HOME (battle bar + PARTICIPATE) → challenge
deck → PLAY → **select judge** → **judge enters shared PIN** → judge evaluates →
SUBMIT → confirmation shows the bar movement → phone goes back to the participant.

### Judge flow
The judge holds the phone. Nothing on screen needs scrolling to reach SUBMIT:
the submit button is a sticky bar at the bottom. Selecting a judge and entering
the PIN takes about five seconds.