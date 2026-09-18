import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config.js';
import {
  DEFAULT_EVENT_CONFIG,
  DEFAULT_EVENT_STATE,
  aiStatus,
  threatLevel,
} from '../lib/scoring.js';
import { useAuth } from './AuthContext.jsx';

/**
 * THE GLOBAL BATTLE BAR
 * ---------------------
 * ONE document - eventState/main - is the entire event-wide battle state.
 * Every participant screen and the admin dashboard listen to that single
 * document, which is why "Judge Sathvik submits -> every phone moves" costs
 * one document read per change and cannot drift out of sync.
 */

const EventContext = createContext(null);

/** Ticking clock so ambience animates without extra writes. */
export function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function EventProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(DEFAULT_EVENT_STATE);
  const [config, setConfig] = useState(DEFAULT_EVENT_CONFIG);
  const [pin, setPin] = useState(null);
  const [stateReady, setStateReady] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!db || !user) {
      setStateReady(false);
      setConfigReady(false);
      return undefined;
    }
    const unsubState = onSnapshot(
      doc(db, 'eventState', 'main'),
      (snap) => {
        setState(snap.exists() ? { ...DEFAULT_EVENT_STATE, ...snap.data() } : { ...DEFAULT_EVENT_STATE });
        setStateReady(true);
      },
      (err) => {
        setError(err.message || 'Cannot read battle state');
        setStateReady(true);
      }
    );
    const unsubConfig = onSnapshot(
      doc(db, 'config', 'event'),
      (snap) => {
        setConfig(snap.exists() ? { ...DEFAULT_EVENT_CONFIG, ...snap.data() } : { ...DEFAULT_EVENT_CONFIG });
        setConfigReady(true);
      },
      () => setConfigReady(true)
    );
    const unsubPin = onSnapshot(
      doc(db, 'config', 'judgePin'),
      (snap) => setPin(snap.exists() ? snap.data() : null),
      () => setPin(null)
    );
    return () => {
      unsubState();
      unsubConfig();
      unsubPin();
    };
  }, [user]);

  const value = useMemo(() => {
    const human = Number.isFinite(state.humanPower) ? state.humanPower : DEFAULT_EVENT_STATE.humanPower;
    const ai = 100 - human;
    return {
      state,
      config,
      pin,
      stateReady,
      configReady,
      error,
      human,
      ai,
      status: aiStatus(ai),
      threat: threatLevel(ai),
      frozen: state.mode === 'FROZEN',
      lastSubmissionAt: state.lastSubmissionAt || null,
      totalSubmissions: Number(state.totalSubmissions) || 0,
      humanWins: Number(state.humanWins) || 0,
      aiWins: Number(state.aiWins) || 0,
    };
  }, [state, config, pin, stateReady, configReady, error]);

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

export function useEvent() {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error('useEvent must be used inside <EventProvider>');
  return ctx;
}
