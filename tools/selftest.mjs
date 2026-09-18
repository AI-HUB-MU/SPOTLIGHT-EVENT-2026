/**
 * OFFLINE SELF-TEST  (npm run selftest)
 * ---------------------------------------------------------------------------
 * Runs in plain Node with no Firebase, no browser and no emulator. This is how
 * you check the parts that would be catastrophic to get wrong - the PIN hash,
 * the battle-bar maths and the time parsing - in two seconds, on the bus, on
 * the morning of the event.
 */
import crypto from 'node:crypto';
import { hashPin, newSalt, sha256Hex } from '../src/lib/hash.js';
import {
  BAR,
  DEFAULT_EVENT_CONFIG,
  clampHuman,
  computeNextPower,
  recomputeBar,
} from '../src/lib/scoring.js';
import { formatRace, formatSeconds, normalizeRoll, parseClock, parseRace } from '../src/lib/util.js';

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

// --------------------------------------------------------------- SHA-256 ----
section('SHA-256 (pure JS implementation vs Node crypto)');
const vectors = [
  '',
  'abc',
  'HVAI2026',
  'the quick brown fox jumps over the lazy dog',
  'mixed unicode input and an emoji',
  'a'.repeat(1000),
];
vectors.forEach((input, index) => {
  const mine = sha256Hex(input);
  const reference = crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  check(`vector ${index} (${input.slice(0, 18) || 'empty'})`, mine === reference, `${mine} != ${reference}`);
});
check('sha256 length is 64 hex chars', sha256Hex('x').length === 64);

// -------------------------------------------------------------- judge PIN ----
section('Judge PIN hashing');
const salt = newSalt();
const digest = hashPin(salt, 'HVAI2026');
check('same pin + salt is deterministic', hashPin(salt, 'HVAI2026') === digest);
check('a different pin differs', hashPin(salt, 'HVAI2027') !== digest);
check('a different salt differs', hashPin(newSalt(), 'HVAI2026') !== digest);
check('salt is 32 hex chars', salt.length === 32);
check('the pin itself is not recoverable from the digest', !digest.includes('HVAI2026'));

// ------------------------------------------------------ battle bar bounds ----
section('Battle bar invariants (the promise the rules also enforce)');
check('clampHuman floor is 54', clampHuman(0) === BAR.FLOOR);
check('clampHuman ceiling is 92', clampHuman(999) === BAR.CEIL);
check('AI can never exceed 46%', 100 - clampHuman(-500) === 46);

const cfg = { ...DEFAULT_EVENT_CONFIG, aiCreepEnabled: false };
let human = BAR.START_HUMAN;
for (let i = 0; i < 400; i += 1) {
  human = computeNextPower({
    currentHuman: human,
    success: false,
    activityId: 'consoles',
    config: cfg,
    lastSubmissionAtMs: null,
    nowMs: Date.now(),
  }).humanPower;
}
check('400 consecutive failures pin at 54% human / 46% AI', human === 54, `got ${human}`);

human = BAR.START_HUMAN;
for (let i = 0; i < 400; i += 1) {
  human = computeNextPower({
    currentHuman: human,
    success: true,
    activityId: 'consoles',
    config: cfg,
    lastSubmissionAtMs: null,
    nowMs: Date.now(),
  }).humanPower;
}
check('400 consecutive wins cap at 92% human', human === 92, `got ${human}`);

const up = computeNextPower({
  currentHuman: 60,
  success: true,
  activityId: 'consoles',
  config: cfg,
  lastSubmissionAtMs: null,
  nowMs: 0,
});
check('a human win adds the configured amount', up.humanPower === 64, `got ${up.humanPower}`);
check('human + ai always totals 100', up.humanPower + up.aiPower === 100);

const down = computeNextPower({
  currentHuman: 60,
  success: false,
  activityId: 'hearing',
  config: cfg,
  lastSubmissionAtMs: null,
  nowMs: 0,
});
check('a failure costs the configured amount', down.humanPower === 59, `got ${down.humanPower}`);

// ------------------------------------------------------------- AI creeping ----
section('AI creep is bounded (event driven, never a runaway timer)');
const creepCfg = { ...DEFAULT_EVENT_CONFIG, aiCreepEnabled: true, decayPerMinute: 0.05 };
const tenHours = 10 * 60 * 60 * 1000;
const crept = computeNextPower({
  currentHuman: 54,
  success: false,
  activityId: 'captcha',
  config: creepCfg,
  lastSubmissionAtMs: Date.now() - tenHours,
  nowMs: Date.now(),
});
check('drift is capped at +8 points per submission', crept.drift <= 8, `drift ${crept.drift}`);
check('creep can never push AI above 46', crept.aiPower <= 46, `ai ${crept.aiPower}`);
check('creep cannot exceed the rules delta limit (+-18)', Math.abs(crept.humanDelta) <= 18);

// ----------------------------------------------------------- repair maths ----
section('recomputeBar (the RECALCULATE FROM LOGS button)');
const synthetic = [];
for (let i = 0; i < 200; i += 1) {
  synthetic.push({
    activityId: ['captcha', 'consoles', 'turing', 'hearing'][i % 4],
    success: i % 10 !== 0, // 90% success rate
    score: 70,
  });
}
const bar = recomputeBar(synthetic, DEFAULT_EVENT_CONFIG);
check('repair keeps human within limits', bar.humanPower >= 54 && bar.humanPower <= 92, `${bar.humanPower}`);
check('repair counts wins + losses', bar.humanWins + bar.aiWins === 200);
check('repair keeps human + ai at 100', bar.humanPower + bar.aiPower === 100);

const worstCase = Array.from({ length: 500 }, () => ({ activityId: 'consoles', success: false, score: 0 }));
check('500 failures still cannot break the AI cap', recomputeBar(worstCase, DEFAULT_EVENT_CONFIG).aiPower === 46);

// ---------------------------------------------------------------- parsing ----
section('Time parsing + formatting');
check('"00:32" -> 32s', parseClock('00:32') === 32000);
check('"32" -> 32s', parseClock('32') === 32000);
check('"01:24.32" -> 84.32s', parseRace('01:24.32') === 84320);
check('garbage rejected', parseClock('abc') === null && parseRace('9:9:9') === null);
check('formatRace round trip', formatRace(84320) === '01:24.32', formatRace(84320));
check('formatSeconds', formatSeconds(97000) === '01:37', formatSeconds(97000));
check('roll normalisation', normalizeRoll(' 23ab cd ') === '23ABCD', normalizeRoll(' 23ab cd '));

// -------------------------------------------------------------------- end ----
console.log(`\n${failures === 0 ? 'ALL GREEN' : 'FAILURES PRESENT'}: ${checks - failures}/${checks} checks passed.`);
process.exit(failures === 0 ? 0 : 1);