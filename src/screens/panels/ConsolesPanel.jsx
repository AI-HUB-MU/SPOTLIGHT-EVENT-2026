import { useState } from 'react';
import { BigTimer, Chip, Panel, ToggleGroup } from '../../components/ui.jsx';
import { useStopwatch } from '../../lib/useTimers.js';
import { formatRace } from '../../lib/util.js';
import { Field, Row, ScoreInput, SubmitBar, parseRace } from './parts.jsx';

/**
 * 02 // COMPETITIVE CONSOLES!
 * A race against the machine. The judge runs a stopwatch on this screen.
 * The timer is epoch-based (see useTimers.js) so a screen lock or a refresh
 * does NOT corrupt the race time - it is persisted in sessionStorage.
 */
export default function ConsolesPanel({ participant, activity, sending, onSubmit }) {
  const [success, setSuccess] = useState(true);
  const [manual, setManual] = useState('');
  const [penalty, setPenalty] = useState('0');
  const [score, setScore] = useState('');
  const [error, setError] = useState('');

  const stopwatch = useStopwatch(`hvai.timer.${participant?.rollId}.consoles`);
  const manualMs = parseRace(manual);
  const timeMs = manualMs === null ? (stopwatch.elapsed || null) : manualMs;
  const seconds = timeMs === null ? 0 : Math.round(timeMs / 1000);
  const penaltyNum = Number(penalty) || 0;
  const suggestion = success ? Math.max(0, 100 - seconds - penaltyNum) : 0;
  const shownScore = score === '' ? String(suggestion) : score;

  function submit() {
    setError('');
    if (timeMs === null || timeMs <= 0) {
      setError('START THE TIMER OR TYPE THE RACE TIME (mm:ss.cc)');
      return;
    }
    if (!Number.isFinite(Number(shownScore))) {
      setError('ENTER A NUMERIC SCORE');
      return;
    }
    onSubmit({
      success,
      timeMs,
      penalty: penaltyNum,
      score: Number(shownScore),
      metricLabel: formatRace(timeMs),
    });
  }

  return (
    <Panel title={`${activity.no} // ${activity.name}`} right={<Chip tone='neutral'>TIME</Chip>}>
      <BigTimer
        value={formatRace(stopwatch.finished && manualMs === null ? stopwatch.elapsed : timeMs || 0)}
        label='OFFICIAL RACE TIME'
        tone={success ? 'ok' : 'danger'}
      />

      <Row label='RACE TIMER'>
        <div className='time-row'>
          <button
            type='button'
            className={`btn btn-lg ${stopwatch.running ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => (stopwatch.running ? stopwatch.stop() : stopwatch.start())}
            disabled={sending}
          >
            {stopwatch.running ? 'STOP' : 'START'}
          </button>
          <button
            type='button'
            className='btn btn-lg btn-ghost'
            onClick={() => {
              stopwatch.reset();
              setManual('');
            }}
            disabled={sending || stopwatch.running}
          >
            RESET
          </button>
        </div>
      </Row>

      <Field label='MANUAL RACE TIME (mm:ss.cc)' hint='Only if the clock was not used: e.g. 01:24.32'>
        <input
          className='input mono'
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder='01:24.32'
          disabled={sending}
        />
      </Field>

      <Row label='COMPLETION'>
        <ToggleGroup
          value={success}
          onChange={setSuccess}
          disabled={sending}
          options={[
            { value: true, label: 'SUCCESS', tone: 'ok' },
            { value: false, label: 'FAILURE', tone: 'danger' },
          ]}
        />
      </Row>

      <Field label='PENALTY (POINTS)'>
        <input
          className='input mono score-input'
          value={penalty}
          onChange={(e) => setPenalty(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode='numeric'
          disabled={sending}
        />
      </Field>

      <ScoreInput
        label='FINAL SCORE'
        value={shownScore}
        onChange={(v) => setScore(v)}
        suggestion={suggestion}
      />

      <SubmitBar
        sending={sending}
        onSubmit={submit}
        error={error}
        note='Lower time wins the leaderboard. One submission only.'
      />
    </Panel>
  );
}