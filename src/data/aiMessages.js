/**
 * PRESENTATION-ONLY ambience ($7 of the brief).
 *
 * These lines rotate on every screen based purely on the live bar + the time
 * since the last submission. They write NOTHING to the database, so the AI can
 * "feel alive" in the hall without ever risking the real score.
 */

export const AI_TICKER = {
  contained: [
    'AI CORE: DORMANT',
    'CONTAINMENT FIELD: STABLE',
    'RESISTANCE PROTOCOL: ENGAGED',
    'OBJECTIVE: DEFEND HUMANITY',
  ],
  active: [
    'AI SYSTEM STATUS: ACTIVE',
    'MACHINE IS OBSERVING HUMAN BEHAVIOUR',
    'AI SUBSYSTEMS ONLINE — WATCHFUL',
    'OBJECTIVE: DEFEND HUMANITY',
  ],
  engaged: [
    'AI HAS DETECTED HUMAN WEAKNESS.',
    'AI IS ADAPTING…',
    'RESISTANCE LEVEL DROPPING…',
    'AI SYSTEM ACTIVITY DETECTED…',
  ],
  elevated: [
    'WARNING: AI GAINING GROUND',
    'CONTAINMENT FIELD STRAINED',
    'AI IS EXPLOITING PATTERNS IN HUMAN RESPONSES',
    'RESISTANCE LEVEL DROPPING…',
  ],
  critical: [
    'AI CONTROL APPROACHING CRITICAL LEVEL',
    'CONTAINMENT BREACH IMMINENT — RALLY, HUMANS',
    'AI HAS TAKEN THE UPPER HAND',
    'CRITICAL: HUMAN RESISTANCE REQUIRED',
  ],
};

/** Longer "system log" lines for the empty-feeling moments. */
export const AI_IDLE_LINES = [
  'AI IS ADAPTING…',
  'AI SYSTEM ACTIVITY DETECTED…',
  'RESISTANCE LEVEL DROPPING…',
  'AI HAS DETECTED HUMAN WEAKNESS.',
];

export function tickerLines(tierKey) {
  return AI_TICKER[tierKey] || AI_TICKER.contained;
}

/**
 * Idle "creep" indicator: purely visual, derived from how long ago the last
 * submission happened. Returns 0..1 so the UI can pulse/scramble a little
 * more the longer the hall goes quiet. Nothing is written.
 */
export function idleIntensity(lastSubmissionAtMs, nowMs, maxMinutes = 20) {
  if (!lastSubmissionAtMs) return 0;
  const minutes = Math.max(0, (nowMs - lastSubmissionAtMs) / 60000);
  return Math.max(0, Math.min(1, minutes / maxMinutes));
}
