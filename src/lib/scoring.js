/**
 * THE HEALTH BAR ALGORITHM - pure functions, shared by every client.
 * Because it is pure, it is unit-tested in tools/selftest.mjs.
 *
 * Guarantees required by the event design:
 *      54 <= HUMAN <= 92        8 <= AI <= 46        HUMAN + AI === 100
 * so the AI can look dangerous, but can never actually win.
 */

export const BAR = {
  FLOOR: 54, // human can never drop below this  -> AI can never exceed 46
  CEIL: 92, // human can never exceed this
  START_HUMAN: 68,
  START_AI: 32,
};

/** Fallback tuning, used until config/event exists (and in tests). */
export const DEFAULT_EVENT_CONFIG = {
  baseHuman: BAR.START_HUMAN,
  humanGain: { captcha: 3, consoles: 4, turing: 3, hearing: 2 },
  aiGain: { captcha: 2, consoles: 3, turing: 2, hearing: 1 },
  aiCreepEnabled: false,
  decayPerMinute: 0.012,
  turingRounds: 3,
  turingPassMark: 2,
  hearingSeconds: 45,
  pinVersion: 1,
};

export const DEFAULT_EVENT_STATE = {
  humanPower: BAR.START_HUMAN,
  aiPower: BAR.START_AI,
  humanWins: 0,
  aiWins: 0,
  totalSubmissions: 0,
  scoreSum: 0,
  lastSubmissionAt: null,
  lastHumanAt: null,
  mode: 'LIVE',
  version: 1,
};

export function clampHuman(value) {
  const n = Math.round(Number(value));
  const safe = Number.isFinite(n) ? n : BAR.START_HUMAN;
  return Math.max(BAR.FLOOR, Math.min(BAR.CEIL, safe));
}

/**
 * The AI "creeping" effect ($7 of the brief).
 *
 * RECOMMENDED DESIGN - event-driven drift, NOT a background timer:
 *   the drift is computed from the server timestamp of the previous submission
 *   at the moment a new submission is committed. That means:
 *     - nothing is written while the hall is idle            (no fragile timer)
 *     - it cannot be double-applied                          (one transaction)
 *     - it is bounded by FLOOR/CEIL and by the rules layer   (cannot lose the event)
 *     - one admin toggle disables it                         (aiCreepEnabled)
 *   Ambience in between submissions is presentation-only (src/data/aiMessages).
 */
export function computeNextPower({
  currentHuman,
  success,
  activityId,
  config,
  lastSubmissionAtMs,
  nowMs,
}) {
  const cfg = config || DEFAULT_EVENT_CONFIG;
  const start = Number.isFinite(currentHuman) ? currentHuman : BAR.START_HUMAN;

  // Tolerate a stored value that somehow drifted outside the range.
  let human = Math.max(BAR.FLOOR - 14, Math.min(BAR.CEIL + 14, start));
  let drift = 0;

  if (cfg.aiCreepEnabled && lastSubmissionAtMs && nowMs > lastSubmissionAtMs) {
    const minutes = Math.min(360, (nowMs - lastSubmissionAtMs) / 60000);
    const target = Number.isFinite(cfg.baseHuman) ? cfg.baseHuman : BAR.START_HUMAN;
    const rate = Number.isFinite(cfg.decayPerMinute) ? cfg.decayPerMinute : 0.012;
    drift = (target - human) * (1 - Math.exp(-rate * minutes));
    // Hard cap: the drift and the gain together must always stay inside the
    // band the security rules allow for a single write (+-18).
    drift = Math.max(-8, Math.min(8, drift));
    human += drift;
  }

  const gain = success
    ? Number(cfg.humanGain?.[activityId] ?? 3)
    : -Number(cfg.aiGain?.[activityId] ?? 2);

  const humanPower = clampHuman(human + gain);
  const aiPower = 100 - humanPower;

  return {
    humanPower,
    aiPower,
    humanDelta: humanPower - start,
    aiDelta: aiPower - (100 - start),
    gain: Math.round(gain),
    drift: Math.round(drift * 100) / 100,
  };
}

/** Threshold tiers drive every warning colour and status line in the UI. */
export function aiStatus(aiPower) {
  const ai = Number(aiPower) || 0;
  if (ai >= 45) {
    return { key: 'critical', label: 'CRITICAL — AI CONTROL APPROACHING CRITICAL LEVEL', tone: 'danger' };
  }
  if (ai >= 41) return { key: 'elevated', label: 'AI ADVANCING — CONTAINMENT FIELD STRAINED', tone: 'warn' };
  if (ai >= 36) return { key: 'engaged', label: 'RESISTANCE PROTOCOL: ENGAGED', tone: 'warn' };
  if (ai >= 26) return { key: 'active', label: 'AI SYSTEM STATUS: ACTIVE', tone: 'neutral' };
  return { key: 'contained', label: 'AI STATUS: CONTAINED', tone: 'ok' };
}

/** Exponential-ish visual intensity, used for glitch/scanline effects. */
export function threatLevel(aiPower) {
  const ai = Math.max(0, Math.min(46, Number(aiPower) || 0));
  return Math.round(((ai - 8) / 38) * 100) / 100;
}

/** Repair tool: rebuild the bar from the authoritative progress documents. */
export function recomputeBar(progressDocs, config) {
  const cfg = config || DEFAULT_EVENT_CONFIG;
  const base = Number.isFinite(cfg.baseHuman) ? cfg.baseHuman : BAR.START_HUMAN;
  let net = 0;
  let wins = 0;
  let losses = 0;
  let scoreSum = 0;

  (progressDocs || []).forEach((doc) => {
    if (!doc || doc.voided) return;
    scoreSum += Number(doc.score) || 0;
    if (doc.success) {
      wins += 1;
      net += Number(cfg.humanGain?.[doc.activityId] ?? 3);
    } else {
      losses += 1;
      net -= Number(cfg.aiGain?.[doc.activityId] ?? 2);
    }
  });

  const humanPower = clampHuman(base + net);
  return {
    humanPower,
    aiPower: 100 - humanPower,
    humanWins: wins,
    aiWins: losses,
    totalSubmissions: wins + losses,
    scoreSum,
  };
}
