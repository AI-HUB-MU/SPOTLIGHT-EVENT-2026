import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import { ACTIVITIES } from '../../data/activities.js';
import { countProgressFor } from '../../lib/admin.js';

/**
 * ADMIN LIVE DATA
 * ---------------
 * Four listeners power the whole command centre. Leaderboards are computed in
 * memory from the progress collection, which is why this project needs NO
 * composite Firestore indexes - one less thing that can be "not built yet" at
 * exactly the wrong moment.
 */
export function useAdminData(enabled) {
  const [participants, setParticipants] = useState([]);
  const [progress, setProgress] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [audit, setAudit] = useState([]);
  const [ready, setReady] = useState({ participants: false, progress: false, submissions: false });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled || !db) return undefined;
    const onError = (err) => setError(err.message || 'listener failed');

    const u1 = onSnapshot(
      collection(db, 'participants'),
      (snap) => {
        setParticipants(snap.docs.map((d) => ({ rollId: d.id, ...d.data() })));
        setReady((r) => ({ ...r, participants: true }));
      },
      onError
    );
    const u2 = onSnapshot(
      collection(db, 'progress'),
      (snap) => {
        setProgress(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setReady((r) => ({ ...r, progress: true }));
      },
      onError
    );
    const u3 = onSnapshot(
      query(collection(db, 'submissions'), orderBy('createdAtMs', 'desc'), limit(60)),
      (snap) => {
        setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setReady((r) => ({ ...r, submissions: true }));
      },
      onError
    );
    const u4 = onSnapshot(
      query(collection(db, 'audit'), orderBy('createdAtMs', 'desc'), limit(40)),
      (snap) => setAudit(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onError
    );

    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, [enabled]);

  const derived = useMemo(() => {
    const totalParticipants = participants.length;
    const totalChallenges = totalParticipants * ACTIVITIES.length;
    const completed = progress.length;
    const humanWins = progress.filter((p) => p.success).length;
    const aiWins = completed - humanWins;
    const scoreSum = progress.reduce((sum, p) => sum + (Number(p.score) || 0), 0);
    const avgScore = completed ? Math.round(scoreSum / completed) : 0;
    const disqualified = participants.filter((p) => p.status === 'DISQUALIFIED').length;
    const idle = participants.filter((p) => (Number(p.completedCount) || 0) === 0).length;

    const leaderboards = ACTIVITIES.map((activity) => {
      const rows = progress.filter((p) => p.activityId === activity.id);
      if (activity.id === 'consoles') {
        rows.sort((a, b) => {
          if (a.success !== b.success) return a.success ? -1 : 1;
          return (a.timeMs || 1e9) - (b.timeMs || 1e9);
        });
      } else if (activity.id === 'turing') {
        rows.sort(
          (a, b) => (b.attemptsCorrect || 0) - (a.attemptsCorrect || 0) || (b.score || 0) - (a.score || 0)
        );
      } else {
        rows.sort((a, b) => (b.score || 0) - (a.score || 0));
      }
      return {
        activity,
        top: rows.slice(0, 3).map((row) => ({
          rollId: row.rollId,
          name: row.participantName || row.rollId,
          score: row.score,
          label: row.metricLabel || String(row.score || ''),
          success: row.success,
          judgeId: row.judgeId,
        })),
        count: rows.length,
      };
    });

    const byRoll = new Map();
    progress.forEach((p) => {
      if (!byRoll.has(p.rollId)) byRoll.set(p.rollId, []);
      byRoll.get(p.rollId).push(p);
    });
    const progressByRoll = Object.fromEntries(byRoll);

    return {
      totalParticipants,
      totalChallenges,
      completed,
      humanWins,
      aiWins,
      avgScore,
      disqualified,
      idle,
      leaderboards,
      progressByRoll,
    };
  }, [participants, progress]);

  return { participants, progress, submissions, audit, ready, error, ...derived };
}

/** Recompute a participant's counters from their progress documents. */
export function participantCounters(progressDocs) {
  return countProgressFor(progressDocs || []);
}
