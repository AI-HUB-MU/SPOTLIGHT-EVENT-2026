import { useState } from 'react';
import { Chip, Panel, ToggleGroup } from '../../components/ui.jsx';
import { useStopwatch } from '../../lib/useTimers.js';
import { formatSeconds } from '../../lib/util.js';
import { Row, ScoreInput, SubmitBar, parseClock } from './parts.jsx';

/**
 * 01 // OFFLINE CAPTCHA — "ARE YOU HUMAN?"
 * A physical / mental puzzle run away from the phone. The judge simply
 * records what happened: completed, how long, how hard, and a score.
 */
export default function CaptchaPanel({ participant, activity, sending, onSubmit }) {
  const [completed, setCompleted] = useState(true);
  const [difficulty, setDifficulty] = useState('NORMAL');
  const [timeText, setTimeText] = useState('');
  const [score, setScore] = useState('70');
  const [error, setError] = useState('');

  const stopwatch = useStopwatch(`hvai.timer.${participant?.rollId}.captcha`);
  const timeMs = parseClock(timeText);

  const suggestion = completed ? (difficulty === 'HARD' ? 90 : 70) : 0;

  function submit() {
    setError('');
    const scoreNum = Number(score);
    if (!Number.isFinite(scoreNum) || score === '') {
      setError('ENTER A NUMERIC SCORE');
      return;
    }
    onSubmit({
      success: completed,
      difficulty,
      timeMs: timeMs === null ? null : timeMs,
      score: scoreNum,
      metricLabel: timeMs === null ? '' : formatSeconds(timeMs),
    });
  }

  return (
    <Panel title={`${activity.no} // ${activity.name}`} right={<Chip tone='neutral'>{activity.metric}</Chip>}>
      <Row label='COMPLETED'>
        <ToggleGroup
          value={completed}
          onChange={setCompleted}
          disabled={sending}
          options={[
            { value: true, label: 'YES', tone: 'ok' },
            { value: false, label: 'NO', tone: 'danger' },
          ]}
        />
      </Row>

      <Row label='TIME TAKEN' hint='mm:ss — use the timer or type it in by hand'>
        <div className='time-row'>
          <input
            className='input mono time-input'
            value={timeText}
            onChange={(e) => setTimeText(e.target.value)}
            placeholder='00:32'
            inputMode='numeric'
            disabled={sending}
          />
          <button
            type='button'
            className={`btn btn-sm ${stopwatch.running ? 'btn-danger' : 'btn-ghost'}`}
            onClick={() => (stopwatch.running ? stopwatch.stop() : stopwatch.start())}
            disabled={sending}
          >
            {stopwatch.running ? 'STOP' : stopwatch.finished ? 'RESTART' : 'START'}
          </button>
          <span className='mono time-live'>{formatSeconds(stopwatch.elapsed)}</span>
          <button
            type='button'
            className='link-btn'
            onClick={() => setTimeText(formatSeconds(stopwatch.elapsed))}
            disabled={sending}
          >
            USE TIMER
          </button>
        </div>
      </Row>

      <Row label='DIFFICULTY'>
        <ToggleGroup
          value={difficulty}
          onChange={setDifficulty}
          disabled={sending}
          options={[
            { value: 'NORMAL', label: 'NORMAL' },
            { value: 'HARD', label: 'HARD' },
          ]}
        />
      </Row>

      <ScoreInput value={score} onChange={setScore} suggestion={suggestion} />

      <SubmitBar
        sending={sending}
        onSubmit={submit}
        error={error}
        note='One submission only. Double taps are ignored, and this challenge cannot be submitted twice.'
      />
    </Panel>
  );
}
