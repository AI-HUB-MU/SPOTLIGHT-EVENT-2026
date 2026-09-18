import { useState } from 'react';
import { BigTimer, Chip, Panel, ToggleGroup } from '../../components/ui.jsx';
import { useCountdown } from '../../lib/useTimers.js';
import { formatSeconds } from '../../lib/util.js';
import { Field, Row, ScoreInput, SubmitBar, parseClock } from './parts.jsx';

/**
 * 04 // HELLO, CAN YOU HEAR ME?
 * Headphones on, identify what the machine is saying. Countdown timer runs
 * from config/event.hearingSeconds (default 45 s) and is epoch-based, so a
 * locked screen cannot fake extra time.
 */
export default function HearingPanel({ participant, activity, config, sending, onSubmit }) {
  const seconds = Number(config?.hearingSeconds) || 45;
  const [success, setSuccess] = useState(false);
  const [answer, setAnswer] = useState('');
  const [manual, setManual] = useState('');
  const [score, setScore] = useState('');
  const [error, setError] = useState('');

  const countdown = useCountdown(`hvai.cd.${participant?.rollId}.hearing`, seconds);
  const manualMs = parseClock(manual);
  const elapsedMs = manualMs === null ? (countdown.elapsed || null) : manualMs;
  const elapsedSeconds = elapsedMs === null ? 0 : Math.round(elapsedMs / 1000);
  const suggestion = success ? Math.max(20, 100 - elapsedSeconds) : 0;
  const shownScore = score === '' ? String(suggestion) : score;

  function submit() {
    setError('');
    if (!answer.trim()) {
      setError('ENTER WHAT THE PARTICIPANT HEARD');
      return;
    }
    onSubmit({
      success,
      timeMs: elapsedMs === null ? null : elapsedMs,
      answer: answer.trim(),
      score: Number(shownScore) || 0,
      metricLabel: elapsedMs === null ? '' : formatSeconds(elapsedMs),
    });
  }

  return (
    <Panel title={`${activity.no} // ${activity.name}`} right={<Chip tone='neutral'>SCORE</Chip>}>
      <BigTimer
        value={formatSeconds(countdown.remaining)}
        label={countdown.expired ? 'TIME UP' : 'TIME REMAINING'}
        tone={countdown.expired ? 'danger' : countdown.remaining < 10000 ? 'warn' : 'ok'}
      />

      <Row label='AUDIO TIMER' hint={`${seconds} second limit — set in config/event`}>
        <div className='time-row'>
          <button
            type='button'
            className={`btn btn-lg ${countdown.running ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => (countdown.running ? countdown.reset() : countdown.start())}
            disabled={sending}
          >
            {countdown.running ? 'STOP' : countdown.elapsed > 0 ? 'RESTART' : 'START'}
          </button>
          <span className='mono time-live'>ELAPSED {formatSeconds(countdown.elapsed)}</span>
        </div>
      </Row>

      <Field label='ANSWER — WHAT DID THEY HEAR?'>
        <input
          className='input'
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder='type the answer the participant gave'
          maxLength={120}
          disabled={sending}
        />
      </Field>

      <Row label='CORRECT?'>
        <ToggleGroup
          value={success}
          onChange={setSuccess}
          disabled={sending}
          options={[
            { value: true, label: 'YES', tone: 'ok' },
            { value: false, label: 'NO', tone: 'danger' },
          ]}
        />
      </Row>

      <Field label='TIME TAKEN (mm:ss)' hint='auto-filled from the timer — override if needed'>
        <input
          className='input mono'
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder={formatSeconds(countdown.elapsed)}
          disabled={sending}
        />
      </Field>

      <ScoreInput label='SCORE' value={shownScore} onChange={setScore} suggestion={suggestion} />

      <SubmitBar
        sending={sending}
        onSubmit={submit}
        error={error}
        note='Faster correct answers score higher. One submission only.'
      />
    </Panel>
  );
}