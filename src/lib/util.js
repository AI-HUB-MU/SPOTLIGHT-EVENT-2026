/** Shared helpers: identity, formatting, session persistence, downloads. */

// ---------------------------------------------------------------- identity ----

export const ROLL_RE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;

/** "23xxxx " -> "23XXXX". The roll id IS the Firestore document id. */
export function normalizeRoll(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s.]+/g, '');
}

export function rollIsValid(rollId) {
  return ROLL_RE.test(rollId);
}

export function progressIdOf(rollId, activityId) {
  return `${rollId}_${activityId}`;
}

export function attemptIdOf(rollId) {
  return `${rollId}_turing`;
}

// -------------------------------------------------------- time text parsing ----

/** "0:32" / "32" / "00:32" -> milliseconds (null when unparseable). */
export function parseClock(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length > 2) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const seconds = nums.length === 2 ? nums[0] * 60 + nums[1] : nums[0];
  return Math.max(0, Math.round(seconds * 1000));
}

/** "01:24.32" / "84.32" -> milliseconds. */
export function parseRace(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length > 2) return null;
  const secondsPart = Number(parts[parts.length - 1]);
  const minutes = parts.length === 2 ? Number(parts[0]) : 0;
  if (!Number.isFinite(secondsPart) || !Number.isFinite(minutes)) return null;
  return Math.max(0, Math.round((minutes * 60 + secondsPart) * 1000));
}

// -------------------------------------------------------------- formatting ----

const pad = (n, size = 2) => String(Math.floor(Math.abs(n))).padStart(size, '0');

/** 32000 -> "00:32" */
export function formatSeconds(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(total / 60)}:${pad(total % 60)}`;
}

/** 84320 -> "01:24.32" (mm:ss.cc) */
export function formatRace(ms) {
  const safe = Math.max(0, ms);
  const m = Math.floor(safe / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  const cs = Math.floor((safe % 1000) / 10);
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

/** Handles Firestore Timestamp, Date, number, null. */
export function toMillis(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return null;
}

/** 23:41 style clock, for the admin submissions feed. */
export function formatClockTime(value) {
  const ms = toMillis(value);
  if (!ms) return '--:--';
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatAgo(value, nowMs = Date.now()) {
  const ms = toMillis(value);
  if (!ms) return 'never';
  const secs = Math.max(0, Math.round((nowMs - ms) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export function titleize(text) {
  return String(text || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ----------------------------------------------------------------- numbers ----

export function clampScore(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10000, n));
}

export function toInt(value, fallback = 0) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

// ------------------------------------------------------- session persistence ----

/** sessionStorage = survives refresh + screen lock, dies with the tab. */
export function remember(key, value) {
  try {
    if (value === undefined || value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: non-fatal */
  }
}

export function recall(key, fallback = null) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function forget(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* non-fatal */
  }
}

// ------------------------------------------------------------------ misc -----

export function downloadCsv(filename, rows) {
  const escape = (cell) => {
    const text = cell === null || cell === undefined ? '' : String(cell);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = rows.map((row) => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob([`\ufeff${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Human-readable text for any thrown Firebase/our-own error. */
export function errorText(error) {
  if (!error) return 'Unknown error';
  const code = error.code || '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'INCORRECT PASSWORD';
  }
  if (code === 'auth/user-not-found') return 'ROLL NUMBER NOT REGISTERED';
  if (code === 'auth/email-already-in-use') return 'ROLL NUMBER ALREADY CLAIMED';
  if (code === 'auth/weak-password') return 'PASSWORD TOO SHORT (MIN 6 CHARACTERS)';
  if (code === 'auth/too-many-requests') return 'TOO MANY ATTEMPTS — WAIT 60 SECONDS';
  if (code === 'permission-denied' || String(error.message).includes('permission')) {
    return 'PERMISSION DENIED — this action was blocked by security rules';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'NETWORK UNREACHABLE — check Wi-Fi and press RETRY';
  }
  if (code === 'aborted') return 'CONFLICT — another judge submitted at the same moment';
  return error.message || String(error);
}
