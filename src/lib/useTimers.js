import { useCallback, useEffect, useRef, useState } from 'react';
import { recall, remember } from './util.js';

/**
 * RELIABLE TIMERS
 * ---------------
 * Rules learned the hard way at live events:
 *   - NEVER accumulate time by adding 1 every tick. iOS Safari throttles or
 *     freezes timers when the screen locks, so the clock would be wrong.
 *   - Instead store an absolute epoch start and always compute
 *     `Date.now() - startedAt`. Screen lock, backgrounding and refreshes are
 *     then invisible to the measurement.
 *   - Persist the start in sessionStorage so a refresh does not lose a race.
 *
 * Storage key is per participant + activity, so switching participants never
 * inherits a running timer.
 */
export function useStopwatch(storageKey) {
  const initial = recall(storageKey, null) || {};
  const [startedAt, setStartedAt] = useState(() => initial.start || null);
  const [stoppedAt, setStoppedAt] = useState(() => initial.stop || null);
  const [, forceRender] = useState(false);
  const rafRef = useRef(null);

  const running = startedAt !== null && stoppedAt === null;

  useEffect(() => {
    if (!running) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return undefined;
    }
    let alive = true;
    const loop = () => {
      if (!alive) return;
      forceRender((v) => !v);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running]);

  const persist = (start, stop) => remember(storageKey, { start, stop });

  const elapsed = startedAt === null ? 0 : Math.max(0, (stoppedAt || Date.now()) - startedAt);

  const start = useCallback(() => {
    const now = Date.now();
    setStartedAt(now);
    setStoppedAt(null);
    persist(now, null);
  }, [storageKey]);

  /** Freeze the clock at "now". Persisted, so a refresh keeps the race time. */
  const stop = useCallback(() => {
    const now = Date.now();
    setStartedAt((s) => {
      persist(s, now);
      return s;
    });
    setStoppedAt((current) => current || now);
  }, [storageKey]);

  const reset = useCallback(() => {
    setStartedAt(null);
    setStoppedAt(null);
    persist(null, null);
  }, [storageKey]);

  /** Manual override: the judge types a time, which stops the clock there. */
  const setElapsed = useCallback(
    (ms) => {
      const now = Date.now();
      const start = now - Math.max(0, ms);
      setStartedAt(start);
      setStoppedAt(now);
      persist(start, now);
    },
    [storageKey]
  );

  return {
    elapsed,
    running: startedAt !== null && stoppedAt === null,
    finished: stoppedAt !== null,
    start,
    stop,
    reset,
    setElapsed,
  };
}

/** Countdown built on the same absolute-deadline principle. */
export function useCountdown(storageKey, seconds) {
  const [deadline, setDeadline] = useState(() => recall(`${storageKey}.dl`, null));
  const [, setTick] = useState(0);

  useEffect(() => {
    if (deadline === null) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [deadline]);

  const remaining = deadline === null ? seconds * 1000 : Math.max(0, deadline - Date.now());
  const expired = remaining <= 0 && deadline !== null;

  const start = useCallback(() => {
    const dl = Date.now() + seconds * 1000;
    setDeadline(dl);
    remember(`${storageKey}.dl`, dl);
    return dl;
  }, [seconds, storageKey]);

  const reset = useCallback(() => {
    setDeadline(null);
    remember(`${storageKey}.dl`, null);
  }, [storageKey]);

  return {
    remaining,
    elapsed: deadline === null ? 0 : Math.max(0, seconds * 1000 - remaining),
    running: deadline !== null && !expired,
    expired,
    start,
    reset,
  };
}
