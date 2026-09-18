import { collection, doc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { computeNextPower, DEFAULT_EVENT_CONFIG, DEFAULT_EVENT_STATE } from './scoring.js';
import { clampScore, progressIdOf, toMillis } from './util.js';

/**
 * =====================================================================
 *  THE SUBMISSION PATH  -  the single most important function in the app.
 * =====================================================================
 *
 * All four challenges, and the admin's manual entry, call exactly this
 * function. One code path = one thing to test.
 *
 * WHY A TRANSACTION (not "read the bar, then write currentHealth + 3"):
 *   Two judges tapping SUBMIT at the same instant on different phones would
 *   both read humanPower = 65 and both write 68 -> one human win silently
 *   disappears. A Firestore transaction does the read-modify-write inside a
 *   server-serialised retry loop, so the second one is re-applied on top of
 *   the new state. No lost updates, ever.
 *
 * WHY DOUBLE-COUNTING IS IMPOSSIBLE:
 *   progress/{rollId}_{activityId} has a DETERMINISTIC id and the security
 *   rules only allow `create` on it. A second submission for the same
 *   participant + challenge fails the whole transaction, so the bar is not
 *   touched either. Refresh, double tap, two phones, two judges - all land
 *   on that single write.
 *
 * ORDER OF OPERATIONS (the 10 steps from the event brief):
 *   1. button disabled in the UI   2. validated here   3. written
 *   4. duplicates impossible       5. progress marked  6/7. score + bar
 *   8. judge recorded              9. timestamps       10. confirmation
 */

export class SubmitError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'SubmitError';
    this.code = code;
  }
}

export function validateSubmissionInput({ participant, activityId, judgeId, result }) {
  if (!participant || !participant.rollId) throw new SubmitError('NO_PARTICIPANT', 'You are not signed in.');
  if (!activityId) throw new SubmitError('NO_ACTIVITY', 'Missing challenge.');
  if (!judgeId) throw new SubmitError('NO_JUDGE', 'Select a judge first.');
  const score = clampScore(result && result.score);
  if (!Number.isFinite(Number(result && result.score))) {
    throw new SubmitError('BAD_SCORE', 'Enter a numeric score.');
  }
  return { success: Boolean(result && result.success), score };
}

export async function submitResult({ db, participant, activityId, activityName, judgeId, pinVersion, result, config }) {
  if (!db) throw new SubmitError('NO_DB', 'Firebase is not configured.');
  const { success, score } = validateSubmissionInput({ participant, activityId, judgeId, result });

  const rollId = participant.rollId;
  const nowMs = Date.now();
  const cfg = config || DEFAULT_EVENT_CONFIG;

  const num = (v) => (v === null || v === undefined ? null : Math.max(0, Math.round(Number(v))));
  const timeMs = num(result && result.timeMs);
  const penalty = num(result && result.penalty);

  const progressRef = doc(db, 'progress', progressIdOf(rollId, activityId));
  const stateRef = doc(db, 'eventState', 'main');
  const partRef = doc(db, 'participants', rollId);
  const submissionRef = doc(collection(db, 'submissions'));
  const auditRef = doc(collection(db, 'audit'));

  return runTransaction(db, async (tx) => {
    // ------------------------------------------------------------ 1. READS
    const existing = await tx.get(progressRef);
    if (existing.exists()) {
      throw new SubmitError('DUPLICATE', 'This challenge is already recorded for your roll number.');
    }

    const stateSnap = await tx.get(stateRef);
    const partSnap = await tx.get(partRef);

    if (!partSnap.exists()) {
      throw new SubmitError('NO_PARTICIPANT', 'Participant record missing. Sign out and sign in again.');
    }

    // Self-healing: a missing bar document is rebuilt instead of failing.
    const state = stateSnap.exists()
      ? { ...DEFAULT_EVENT_STATE, ...stateSnap.data() }
      : { ...DEFAULT_EVENT_STATE };

    if (state.mode === 'FROZEN') {
      throw new SubmitError('FROZEN', 'Submissions are paused by the admin. Try again in a moment.');
    }

    // ---------------------------------------------------------- 2. COMPUTE
    const power = computeNextPower({
      currentHuman: state.humanPower,
      success,
      activityId,
      config: cfg,
      lastSubmissionAtMs: toMillis(state.lastSubmissionAt),
      nowMs,
    });

    const nextState = {
      ...state,
      humanPower: power.humanPower,
      aiPower: power.aiPower,
      humanWins: (Number(state.humanWins) || 0) + (success ? 1 : 0),
      aiWins: (Number(state.aiWins) || 0) + (success ? 0 : 1),
      totalSubmissions: (Number(state.totalSubmissions) || 0) + 1,
      scoreSum: (Number(state.scoreSum) || 0) + score,
      lastSubmissionAt: nowMs,
      lastHumanAt: success ? nowMs : state.lastHumanAt || null,
      updatedAt: nowMs,
      mode: state.mode || 'LIVE',
    };

    const part = partSnap.data();
    const completed = { ...(part.completed || {}) };
    completed[activityId] = {
      success,
      score,
      metricLabel: (result && result.metricLabel) || '',
      judgeId,
      at: nowMs,
    };

    // ---------------------------------------------------------- 3. WRITES
    const progressDoc = {
      rollId,
      rollNumber: participant.rollNumber || rollId,
      participantName: participant.name || '',
      activityId,
      activityName: activityName || activityId,
      success,
      score,
      metricLabel: (result && result.metricLabel) || '',
      timeMs,
      penalty,
      difficulty: (result && result.difficulty) || null,
      roundResults: (result && result.roundResults) || null,
      attemptsCorrect: num(result && result.attemptsCorrect),
      answer: (result && result.answer) || null,
      notes: (result && result.notes) || null,
      judgeId,
      pinVersion: pinVersion === null || pinVersion === undefined ? null : Number(pinVersion),
      humanDelta: power.humanDelta,
      aiDelta: power.aiDelta,
      uid: participant.uid,
      createdAt: serverTimestamp(),
      createdAtMs: nowMs,
    };

    tx.set(progressRef, progressDoc);
    tx.set(submissionRef, {
      ...progressDoc,
      submissionId: submissionRef.id,
      humanPowerAfter: power.humanPower,
      aiPowerAfter: power.aiPower,
      drift: power.drift,
    });
    tx.set(stateRef, nextState);
    tx.update(partRef, {
      totalScore: (Number(part.totalScore) || 0) + score,
      completedCount: (Number(part.completedCount) || 0) + 1,
      passedCount: (Number(part.passedCount) || 0) + (success ? 1 : 0),
      failedCount: (Number(part.failedCount) || 0) + (success ? 0 : 1),
      completed,
      lastActivityId: activityId,
      lastJudgeId: judgeId,
      updatedAt: nowMs,
    });

    // Cheap admin-visible breadcrumb. Invaluable at 23:00 when something looks odd.
    tx.set(auditRef, {
      action: 'SUBMIT',
      actor: rollId,
      summary: `${participant.name || rollId} / ${activityName || activityId} / ${success ? 'PASS' : 'FAIL'} / judge ${judgeId}`,
      humanPowerBefore: state.humanPower,
      humanPowerAfter: power.humanPower,
      createdAt: serverTimestamp(),
      createdAtMs: nowMs,
    });

    return {
      rollId,
      activityId,
      success,
      score,
      humanPower: power.humanPower,
      aiPower: power.aiPower,
      humanDelta: power.humanDelta,
      drift: power.drift,
      submissionId: submissionRef.id,
    };
  });
}

/**
 * TURING TIME ONLY: write the anti-refresh attempt lock at START.
 *
 * Create-once by document id, so refreshing, re-opening or re-entering the
 * challenge can never mint a second set of rounds. In the security rules this
 * document can only be CREATED once and can only move forward.
 *
 * BEST EFFORT BY DESIGN: if the network fails we return { ok: false } and the
 * panel continues without the lock. Losing an extra layer of protection is
 * acceptable; a Wi-Fi hiccup blocking a participant is not.
 */
export async function lockTuringAttempt({ db, participant, rounds, answers }) {
  if (!db || !participant) return { ok: false, code: 'NO_DB' };
  const nowMs = Date.now();
  const ref = doc(db, 'attempts', `${participant.rollId}_turing`);
  try {
    await setDoc(ref, {
      rollId: participant.rollId,
      rollNumber: participant.rollNumber || participant.rollId,
      participantName: participant.name || '',
      activityId: 'turing',
      status: answers ? 'ANSWERED' : 'IN_PROGRESS',
      rounds: rounds || null,
      answers: answers || null,
      uid: participant.uid,
      startedAt: serverTimestamp(),
      startedAtMs: nowMs,
    });
    return { ok: true };
  } catch (error) {
    const code = String((error && error.code) || '');
    if (code.includes('already-exists')) {
      // The lock already exists: the protection is working.
      return { ok: false, code: 'ALREADY_EXISTS' };
    }
    console.warn('[turing] attempt lock failed (continuing without it)', error);
    return { ok: false, code: 'FAILED', error };
  }
}