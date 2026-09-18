import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
  deleteField,
} from 'firebase/firestore';
import { clampHuman, DEFAULT_EVENT_CONFIG, DEFAULT_EVENT_STATE, recomputeBar } from './scoring.js';
import { clampScore } from './util.js';

/**
 * =====================================================================
 *  ADMIN OPERATIONS  -  privileged writes, every one of them audited.
 * =====================================================================
 * Each function performs its work inside ONE transaction or ONE batch, and
 * writes an audit/{id} document containing before/after values. During the
 * live event, the audit trail is what lets you answer "what just changed?"
 * in five seconds instead of twenty minutes.
 */

function auditPayload(action, actor, summary, extra) {
  return {
    action,
    actor: actor || 'admin',
    summary,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    ...(extra || {}),
  };
}

function newAuditRef(db) {
  return doc(collection(db, 'audit'));
}

/** Move the bar by hand (also used for "we want it tenser in the finale"). */
export async function adminAdjustBar({ db, actor, humanPower, reason }) {
  const stateRef = doc(db, 'eventState', 'main');
  const next = clampHuman(humanPower);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(stateRef);
    const before = snap.exists() ? { ...DEFAULT_EVENT_STATE, ...snap.data() } : { ...DEFAULT_EVENT_STATE };
    const nextState = {
      ...before,
      humanPower: next,
      aiPower: 100 - next,
      updatedAt: Date.now(),
      mode: before.mode || 'LIVE',
    };
    tx.set(stateRef, nextState);
    tx.set(
      newAuditRef(db),
      auditPayload('ADJUST_BAR', actor, `bar ${before.humanPower}% -> ${next}%`, {
        reason: reason || '',
        humanPowerBefore: before.humanPower,
        humanPowerAfter: next,
      })
    );
    return nextState;
  });
}

/** Reset the bar and the win counters. Participant progress is untouched. */
export async function adminResetEvent({ db, actor, reason }) {
  const stateRef = doc(db, 'eventState', 'main');
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(stateRef);
    const before = snap.exists() ? snap.data() : { ...DEFAULT_EVENT_STATE };
    const nextState = { ...DEFAULT_EVENT_STATE, updatedAt: Date.now() };
    tx.set(stateRef, nextState);
    tx.set(
      newAuditRef(db),
      auditPayload('RESET_EVENT', actor, 'event bar reset to defaults', {
        reason: reason || '',
        humanPowerBefore: before.humanPower ?? null,
        humanPowerAfter: nextState.humanPower,
      })
    );
    return nextState;
  });
}

export async function adminSetMode({ db, actor, mode, reason }) {
  const stateRef = doc(db, 'eventState', 'main');
  const clean = mode === 'FROZEN' ? 'FROZEN' : 'LIVE';
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(stateRef);
    const before = snap.exists() ? { ...DEFAULT_EVENT_STATE, ...snap.data() } : { ...DEFAULT_EVENT_STATE };
    tx.set(stateRef, { ...before, mode: clean, updatedAt: Date.now() });
    tx.set(
      newAuditRef(db),
      auditPayload('SET_MODE', actor, `mode -> ${clean}`, { reason: reason || '', modeBefore: before.mode, modeAfter: clean })
    );
    return clean;
  });
}

/** Battle tuning: gains, decay, AI creep toggle. No redeploy needed. */
export async function adminSaveConfig({ db, actor, config, reason }) {
  const ref = doc(db, 'config', 'event');
  const snap = await getDoc(ref);
  const before = snap.exists() ? snap.data() : { ...DEFAULT_EVENT_CONFIG };
  const merged = {
    ...DEFAULT_EVENT_CONFIG,
    ...before,
    ...(config || {}),
    updatedAt: Date.now(),
  };
  await setDoc(ref, merged);
  const auditRef = newAuditRef(db);
  await setDoc(auditRef, auditPayload('SAVE_CONFIG', actor, 'battle tuning updated', {
    reason: reason || '',
    before: {
      baseHuman: before.baseHuman ?? null,
      humanGain: before.humanGain ?? null,
      aiGain: before.aiGain ?? null,
      aiCreepEnabled: before.aiCreepEnabled ?? null,
    },
    after: {
      baseHuman: merged.baseHuman,
      humanGain: merged.humanGain,
      aiGain: merged.aiGain,
      aiCreepEnabled: merged.aiCreepEnabled,
    },
  }));
  return merged;
}

/** Rotate the judge PIN. Only the hash + salt are ever stored. */
export async function adminSavePin({ db, actor, salt, pinHash, nextVersion }) {
  const ref = doc(db, 'config', 'judgePin');
  await setDoc(ref, {
    salt,
    pinHash,
    pinVersion: Number(nextVersion) || 1,
    updatedAt: Date.now(),
    updatedBy: actor || 'admin',
  });
  const auditRef = newAuditRef(db);
  await setDoc(auditRef, auditPayload('ROTATE_PIN', actor, `judge PIN rotated to version ${nextVersion}`, {
    pinVersionAfter: Number(nextVersion) || 1,
  }));
}

/** Let a participant who forgot their password rebind their roll number. */
export async function adminSetRebind({ db, actor, rollId, allowed, reason }) {
  const ref = doc(db, 'participants', rollId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error(`Participant ${rollId} not found`);
    tx.update(ref, { rebindAllowed: Boolean(allowed), updatedAt: Date.now() });
    tx.set(
      newAuditRef(db),
      auditPayload('SET_REBIND', actor, `${rollId} rebindAllowed -> ${Boolean(allowed)}`, { reason: reason || '', rollId })
    );
    return Boolean(allowed);
  });
}
/** Aggregate one participant's progress documents into participant counters. */
export function countProgressFor(progressDocs) {
  const mine = progressDocs || [];
  let totalScore = 0;
  let completedCount = 0;
  let passedCount = 0;
  let failedCount = 0;
  const completed = {};
  mine.forEach((p) => {
    totalScore += Number(p.score) || 0;
    completedCount += 1;
    if (p.success) passedCount += 1;
    else failedCount += 1;
    completed[p.activityId] = {
      success: Boolean(p.success),
      score: Number(p.score) || 0,
      metricLabel: p.metricLabel || '',
      judgeId: p.judgeId || '',
      at: p.createdAtMs || 0,
    };
  });
  return { totalScore, completedCount, passedCount, failedCount, completed };
}

/**
 * VOID + REOPEN  (one action, one button in the admin console)
 *
 * Deletes the progress lock document so the participant can attempt the
 * challenge again, rebuilds the bar from the remaining progress documents and
 * repairs that participant's counters. The original result is NEVER lost:
 * submissions/ is append-only and audit/ keeps the admin story.
 */
export async function adminVoidAttempt({ db, actor, progressDoc, allProgress, config, reason }) {
  if (!progressDoc) throw new Error('No progress document supplied');
  const rollId = progressDoc.rollId;
  const progressRef = doc(db, 'progress', progressDoc.id);
  const stateRef = doc(db, 'eventState', 'main');
  const partRef = doc(db, 'participants', rollId);

  const remaining = (allProgress || []).filter((p) => p.id !== progressDoc.id);
  const bar = recomputeBar(remaining, config);
  const counters = countProgressFor(remaining.filter((p) => p.rollId === rollId));

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(progressRef);
    const stateSnap = await tx.get(stateRef);
    const partSnap = await tx.get(partRef);
    const state = stateSnap.exists() ? { ...DEFAULT_EVENT_STATE, ...stateSnap.data() } : { ...DEFAULT_EVENT_STATE };

    if (snap.exists()) tx.delete(progressRef);

    // Only the bar moves here; counter fields are left exactly as read so a
    // concurrent submission by another judge cannot be clobbered.
    tx.set(stateRef, { ...state, humanPower: bar.humanPower, aiPower: bar.aiPower, updatedAt: Date.now() });

    if (partSnap.exists()) {
      tx.update(partRef, { ...counters, updatedAt: Date.now() });
    }

    tx.set(
      newAuditRef(db),
      auditPayload('VOID_REOPEN', actor, `voided ${progressDoc.id} (${progressDoc.activityId})`, {
        reason: reason || '',
        rollId,
        activityId: progressDoc.activityId,
        voidedScore: progressDoc.score ?? null,
        voidedSuccess: progressDoc.success ?? null,
        judgeId: progressDoc.judgeId || null,
        humanPowerBefore: state.humanPower,
        humanPowerAfter: bar.humanPower,
      })
    );

    return { humanPower: bar.humanPower, aiPower: bar.aiPower, counters };
  });
}

/**
 * CORRECT A MISTAKEN SCORE.
 * Optionally flips PASS/FAIL, in which case the bar is adjusted by the exact
 * difference between the old and the new contribution (never a blind +3).
 */
export async function adminCorrectScore({
  db,
  actor,
  progressId,
  newScore,
  newSuccess,
  moveBar,
  config,
  reason,
}) {
  const progressRef = doc(db, 'progress', progressId);
  const stateRef = doc(db, 'eventState', 'main');
  const cfg = config || DEFAULT_EVENT_CONFIG;

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(progressRef);
    if (!snap.exists()) throw new Error('That result no longer exists (was it voided?)');
    const before = snap.data();
    const stateSnap = await tx.get(stateRef);
    const state = stateSnap.exists() ? { ...DEFAULT_EVENT_STATE, ...stateSnap.data() } : { ...DEFAULT_EVENT_STATE };
    const partRef = doc(db, 'participants', before.rollId);
    const partSnap = await tx.get(partRef);

    const score = clampScore(newScore);
    const success =
      newSuccess === undefined || newSuccess === null ? Boolean(before.success) : Boolean(newSuccess);
    const delta = score - (Number(before.score) || 0);
    const passDelta = (success ? 1 : 0) - (before.success ? 1 : 0);

    let humanPower = state.humanPower;
    if (moveBar && passDelta !== 0) {
      const contribution = (ok) =>
        ok
          ? Number(cfg.humanGain?.[before.activityId] ?? 3)
          : -Number(cfg.aiGain?.[before.activityId] ?? 2);
      humanPower = clampHuman(state.humanPower + (contribution(success) - contribution(before.success)));
    }

    tx.update(progressRef, {
      score,
      success,
      correctedAt: Date.now(),
      correctedBy: actor || 'admin',
      correctionReason: reason || '',
    });

    if (partSnap.exists()) {
      const part = partSnap.data();
      tx.update(partRef, {
        totalScore: Math.max(0, (Number(part.totalScore) || 0) + delta),
        passedCount: Math.max(0, (Number(part.passedCount) || 0) + passDelta),
        failedCount: Math.max(0, (Number(part.failedCount) || 0) - passDelta),
        updatedAt: Date.now(),
      });
    }

    if (moveBar) {
      tx.set(stateRef, { ...state, humanPower, aiPower: 100 - humanPower, updatedAt: Date.now() });
    }

    tx.set(
      newAuditRef(db),
      auditPayload('CORRECT_SCORE', actor, `corrected ${progressId}: ${before.score} -> ${score}`, {
        reason: reason || '',
        scoreBefore: before.score ?? null,
        scoreAfter: score,
        successBefore: before.success ?? null,
        successAfter: success,
        humanPowerBefore: state.humanPower,
        humanPowerAfter: humanPower,
      })
    );

    return { score, success, humanPower };
  });
}

/**
 * REBUILD EVERYTHING FROM LOGS  -  the self-healing button.
 * Recomputes the bar and every participant's counters from the authoritative
 * progress collection. Use it the moment any total looks wrong.
 */
export async function adminRebuildFromLogs({ db, actor, progressDocs, participants, config }) {
  const bar = recomputeBar(progressDocs, config);
  const stateRef = doc(db, 'eventState', 'main');
  const stateSnap = await getDoc(stateRef);
  const state = stateSnap.exists()
    ? { ...DEFAULT_EVENT_STATE, ...stateSnap.data() }
    : { ...DEFAULT_EVENT_STATE };

  await setDoc(stateRef, {
    ...state,
    humanPower: bar.humanPower,
    aiPower: bar.aiPower,
    humanWins: bar.humanWins,
    aiWins: bar.aiWins,
    totalSubmissions: bar.totalSubmissions,
    scoreSum: bar.scoreSum,
    updatedAt: Date.now(),
  });

  const byRoll = new Map();
  (progressDocs || []).forEach((p) => {
    if (!byRoll.has(p.rollId)) byRoll.set(p.rollId, []);
    byRoll.get(p.rollId).push(p);
  });

  let repaired = 0;
  let batch = writeBatch(db);
  let ops = 0;
  const flush = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  };

  for (const participant of participants || []) {
    const counters = countProgressFor(byRoll.get(participant.rollId) || []);
    const differs =
      counters.totalScore !== (Number(participant.totalScore) || 0) ||
      counters.completedCount !== (Number(participant.completedCount) || 0) ||
      counters.passedCount !== (Number(participant.passedCount) || 0);
    if (!differs) continue;
    batch.update(doc(db, 'participants', participant.rollId), { ...counters, updatedAt: Date.now() });
    ops += 1;
    repaired += 1;
    if (ops >= 300) await flush();
  }
  await flush();

  await setDoc(
    newAuditRef(db),
    auditPayload('REBUILD_FROM_LOGS', actor, `rebuilt bar from ${(progressDocs || []).length} results`, {
      humanPowerAfter: bar.humanPower,
      participantsRepaired: repaired,
      submissions: bar.totalSubmissions,
    })
  );

  return { ...bar, repaired };
}