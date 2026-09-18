import { useCallback, useState } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { useEvent } from '../state/EventContext.jsx';
import { db } from '../firebase/config.js';
import { HealthBar } from '../components/HealthBar.jsx';
import {
  Button,
  Chip,
  Confirm,
  Field,
  GlitchTitle,
  GridBg,
  Panel,
  Scanlines,
  Spinner,
  Stat,
  ToggleGroup,
} from '../components/ui.jsx';
import { clampHuman } from '../lib/scoring.js';
import {
  adminAdjustBar,
  adminCorrectScore,
  adminRebuildFromLogs,
  adminResetEvent,
  adminSaveConfig,
  adminSavePin,
  adminSetMode,
  adminSetRebind,
  adminVoidAttempt,
} from '../lib/admin.js';
import { hashPin, newSalt } from '../lib/hash.js';
import { downloadCsv, errorText, formatAgo, formatClockTime } from '../lib/util.js';
import { useAdminData } from './admin/useAdminData.js';
import AdminLogin from './admin/AdminLogin.jsx';
import AdminControls from './admin/AdminControls.jsx';
import Leaderboards from './admin/Leaderboards.jsx';
import RecentFeed from './admin/RecentFeed.jsx';
import ResultsTable from './admin/ResultsTable.jsx';

/** Small editor for correcting a single recorded result. */
function CorrectModal({ row, busy, onCancel, onApply }) {
  const [score, setScore] = useState(String(row.score ?? 0));
  const [success, setSuccess] = useState(Boolean(row.success));
  const [moveBar, setMoveBar] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <div className='modal-backdrop' role='dialog' aria-modal='true'>
      <div className='modal'>
        <h3 className='modal-title'>CORRECT RESULT</h3>
        <p className='mono small'>
          {row.rollId} · {row.activityName || row.activityId} · judge {row.judgeId}
        </p>
        <Field label='SCORE'>
          <input
            className='input mono'
            value={score}
            onChange={(e) => setScore(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode='numeric'
          />
        </Field>
        <Field label='RESULT'>
          <ToggleGroup
            value={success}
            onChange={(v) => {
              setSuccess(v);
              setMoveBar(v !== Boolean(row.success));
            }}
            options={[
              { value: true, label: 'PASS', tone: 'ok' },
              { value: false, label: 'FAIL', tone: 'danger' },
            ]}
          />
        </Field>
        <Field label='ALSO MOVE THE BAR?' hint='flipping PASS/FAIL changes the battle automatically'>
          <ToggleGroup
            value={moveBar}
            onChange={setMoveBar}
            options={[
              { value: true, label: 'YES', tone: 'warn' },
              { value: false, label: 'NO' },
            ]}
          />
        </Field>
        <Field label='REASON (KEPT IN THE AUDIT LOG)'>
          <input
            className='input'
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder='judge typo / recount / duplicate'
          />
        </Field>
        <div className='modal-actions'>
          <Button variant='ghost' onClick={onCancel} disabled={busy}>
            CANCEL
          </Button>
          <Button variant='warn' busy={busy} onClick={() => onApply({ score, success, moveBar, reason })}>
            APPLY CORRECTION
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminScreen() {
  const { isAdmin, authReady, user, logout } = useAuth();
  const { human, ai, status, threat, state, config, pin, frozen, lastSubmissionAt } = useEvent();
  const data = useAdminData(isAdmin === true);

  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [correcting, setCorrecting] = useState(null);

  const actor = user?.email || 'admin';

  const run = useCallback(async (key, fn, okMessage) => {
    setBusy(key);
    setError('');
    setToast('');
    try {
      const result = await fn();
      setToast(typeof okMessage === 'function' ? okMessage(result) : okMessage);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  }, []);

  const onChangeBar = useCallback(
    (delta) => {
      const target = clampHuman(Number(human) + Number(delta));
      run(
        'bar',
        () => adminAdjustBar({ db, actor, humanPower: target, reason: 'manual override' }),
        `BAR SET TO ${target}% HUMAN`
      );
    },
    [actor, human, run]
  );

  const onResetBar = useCallback(
    (options) => {
      if (options && options.hard) {
        setConfirm({
          title: 'RESET EVENT BAR + WINS?',
          body: 'The battle bar and the win counters return to 68 / 32. Participant progress and every recorded result are kept.',
          confirmLabel: 'RESET BAR',
          action: () => run('reset', () => adminResetEvent({ db, actor, reason: 'admin reset' }), 'EVENT BAR RESET'),
        });
        return;
      }
      const base = Number(config?.baseHuman) || 68;
      run(
        'bar',
        () => adminAdjustBar({ db, actor, humanPower: base, reason: 'reset to base' }),
        `BAR SET TO BASE ${base}%`
      );
    },
    [actor, config?.baseHuman, run]
  );

  const onRebuild = useCallback(
    () =>
      run(
        'rebuild',
        () =>
          adminRebuildFromLogs({
            db,
            actor,
            progressDocs: data.progress,
            participants: data.participants,
            config,
          }),
        (r) => `REBUILT: HUMAN ${r.humanPower}% · ${r.repaired} PARTICIPANT TOTAL(S) REPAIRED`
      ),
    [actor, config, data.participants, data.progress, run]
  );

  const onSetMode = useCallback(
    (mode) => run('mode', () => adminSetMode({ db, actor, mode, reason: 'admin toggle' }), `MODE: ${mode}`),
    [actor, run]
  );

  const onSaveConfig = useCallback(
    (form) => run('config', () => adminSaveConfig({ db, actor, config: form, reason: 'tuning' }), 'BATTLE TUNING SAVED'),
    [actor, run]
  );

  const onSavePin = useCallback(
    (code) => {
      const salt = newSalt();
      const pinDigest = hashPin(salt, code);
      const nextVersion = (Number(pin?.pinVersion) || 0) + 1;
      run(
        'pin',
        () => adminSavePin({ db, actor, salt, pinHash: pinDigest, nextVersion }),
        `JUDGE PIN ROTATED TO v${nextVersion} — TELL ALL SIX JUDGES`
      );
    },
    [actor, pin?.pinVersion, run]
  );

  const onRebind = useCallback(
    (rollId) =>
      run(
        'rebind',
        () => adminSetRebind({ db, actor, rollId, allowed: true, reason: 'forgot password' }),
        `${rollId} MAY NOW REBIND ON NEXT SIGN-IN`
      ),
    [actor, run]
  );

  const onVoid = useCallback(
    (row) => {
      setConfirm({
        title: `VOID + REOPEN ${row.rollId} / ${row.activityName || row.activityId}?`,
        body: 'The attempt is unlocked so the participant can try again. The bar and their totals are rebuilt from the remaining results. The original entry stays in the submissions log.',
        confirmLabel: 'VOID + REOPEN',
        action: () =>
          run(
            'void',
            () =>
              adminVoidAttempt({
                db,
                actor,
                progressDoc: row,
                allProgress: data.progress,
                config,
                reason: 'admin void',
              }),
            `VOIDED ${row.rollId} / ${row.activityId}`
          ),
      });
    },
    [actor, config, data.progress, run]
  );

  const onCorrect = useCallback(
    (values) => {
      const row = correcting;
      setCorrecting(null);
      if (!row) return;
      run(
        'correct',
        () =>
          adminCorrectScore({
            db,
            actor,
            progressId: row.id,
            newScore: Number(values.score),
            newSuccess: values.success,
            moveBar: values.moveBar,
            config,
            reason: values.reason,
          }),
        `CORRECTED ${row.rollId} / ${row.activityId}`
      );
    },
    [actor, config, correcting, run]
  );

  const onExport = useCallback(
    (kind) => {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      if (kind === 'participants') {
        downloadCsv(`hvai-participants-${stamp}.csv`, [
          ['ROLL', 'NAME', 'SCORE', 'COMPLETED', 'PASSED', 'FAILED', 'STATUS'],
          ...data.participants.map((p) => [
            p.rollId,
            p.name,
            p.totalScore || 0,
            p.completedCount || 0,
            p.passedCount || 0,
            p.failedCount || 0,
            p.status || 'ACTIVE',
          ]),
        ]);
      } else if (kind === 'results') {
        downloadCsv(`hvai-results-${stamp}.csv`, [
          ['ROLL', 'NAME', 'ACTIVITY', 'VALUE', 'SCORE', 'RESULT', 'JUDGE', 'TIME'],
          ...data.progress
            .slice()
            .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0))
            .map((p) => [
              p.rollId,
              p.participantName || '',
              p.activityName || p.activityId,
              p.metricLabel || '',
              p.score || 0,
              p.success ? 'PASS' : 'FAIL',
              p.judgeId || '',
              formatClockTime(p.createdAtMs),
            ]),
        ]);
      } else {
        downloadCsv(`hvai-submissions-${stamp}.csv`, [
          ['TIME', 'ROLL', 'NAME', 'ACTIVITY', 'VALUE', 'SCORE', 'RESULT', 'JUDGE', 'PIN_VERSION'],
          ...data.submissions.map((s) => [
            formatClockTime(s.createdAtMs),
            s.rollId,
            s.participantName || '',
            s.activityName || s.activityId,
            s.metricLabel || '',
            s.score || 0,
            s.success ? 'PASS' : 'FAIL',
            s.judgeId || '',
            s.pinVersion ?? '',
          ]),
        ]);
      }
      setToast(`${kind.toUpperCase()} CSV EXPORTED`);
    },
    [data.participants, data.progress, data.submissions]
  );

  // ------------------------------------------------------------------ guards
  if (!authReady) return <Spinner label='VERIFYING CREDENTIALS…' />;
  if (isAdmin !== true) return <AdminLogin />;
return (
    <div className='shell admin'>
      <GridBg />
      <Scanlines />

      <header className='hud-top'>
        <div className='hud-id'>
          <span className='hud-name'>COMMAND CENTRE</span>
          <span className='hud-roll mono'>{user?.email}</span>
        </div>
        <div className='row gap'>
          <Chip tone={frozen ? 'warn' : 'ok'}>{frozen ? 'SUBMISSIONS FROZEN' : 'LIVE'}</Chip>
          <button type='button' className='link-btn' onClick={logout}>
            SIGN OUT
          </button>
        </div>
      </header>

      {toast ? <div className='toast mono'>{toast}</div> : null}
      {error ? <div className='toast toast-error mono'>{error}</div> : null}
      {data.error ? <div className='toast toast-error mono'>LISTENER: {data.error}</div> : null}
      {!data.ready.progress ? <Spinner label='ATTACHING LIVE FEEDS…' /> : null}

      <main className='stack admin-grid'>
        <section className='battle'>
          <span className='eyebrow'>EVENT-WIDE CONTAINMENT STATUS</span>
          <GlitchTitle className='battle-title'>HUMANS vs AI</GlitchTitle>
          <HealthBar human={human} ai={ai} status={status} threat={threat} lastSubmissionAt={lastSubmissionAt} />
          <p className='muted small mono'>
            LAST SIGNAL {formatAgo(lastSubmissionAt)} · {state?.totalSubmissions || 0} SUBMISSIONS · MODE{' '}
            {state?.mode || 'LIVE'}
          </p>
        </section>

        <div className='grid3'>
          <Stat label='TOTAL PARTICIPANTS' value={data.totalParticipants} sub={`${data.idle} not started`} />
          <Stat label='TOTAL CHALLENGES' value={data.totalChallenges} sub='participants x 4' />
          <Stat label='COMPLETED CHALLENGES' value={data.completed} tone='ok' />
          <Stat label='HUMAN WINS' value={data.humanWins} tone='ok' />
          <Stat label='AI WINS' value={data.aiWins} tone='danger' />
          <Stat
            label='AVERAGE SCORE'
            value={data.avgScore}
            sub={data.disqualified ? `${data.disqualified} disqualified` : ''}
          />
        </div>

        <AdminControls
          state={state}
          config={config}
          pin={pin}
          frozen={frozen}
          busy={Boolean(busy)}
          onChangeBar={onChangeBar}
          onResetBar={onResetBar}
          onRebuild={onRebuild}
          onSetMode={onSetMode}
          onSaveConfig={onSaveConfig}
          onSavePin={onSavePin}
          onRebind={onRebind}
          onExport={onExport}
        />

        <Leaderboards leaderboards={data.leaderboards} />
        <RecentFeed submissions={data.submissions} audit={data.audit} />
        <ResultsTable progress={data.progress} busy={Boolean(busy)} onCorrect={setCorrecting} onVoid={onVoid} />

        <Panel title='PARTICIPANT ROSTER' right={<Chip tone='neutral'>{data.participants.length}</Chip>}>
          <div className='table-wrap'>
            <table className='table'>
              <thead>
                <tr>
                  <th>ROLL</th>
                  <th>NAME</th>
                  <th>SCORE</th>
                  <th>CLEARED</th>
                  <th>PASS / FAIL</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {data.participants
                  .slice()
                  .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
                  .map((p) => (
                    <tr key={p.rollId}>
                      <td className='mono'>{p.rollId}</td>
                      <td>{p.name}</td>
                      <td className='mono'>{p.totalScore || 0}</td>
                      <td className='mono'>{p.completedCount || 0}/4</td>
                      <td className='mono'>
                        {p.passedCount || 0} / {p.failedCount || 0}
                      </td>
                      <td>
                        <Chip tone={p.status === 'DISQUALIFIED' ? 'danger' : 'ok'}>{p.status || 'ACTIVE'}</Chip>
                        {p.rebindAllowed ? <Chip tone='warn'>REBIND ARMED</Chip> : null}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </main>

      {confirm ? (
        <Confirm
          open
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const action = confirm.action;
            setConfirm(null);
            action();
          }}
        />
      ) : null}

      {correcting ? (
        <CorrectModal
          row={correcting}
          busy={busy === 'correct'}
          onCancel={() => setCorrecting(null)}
          onApply={onCorrect}
        />
      ) : null}
    </div>
  );
}