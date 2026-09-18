import { useMemo, useState } from 'react';
import { Chip, Notice, Panel, ToggleGroup } from '../../components/ui.jsx';
import { roundsForRoll } from '../../data/turingBank.js';
import { db } from '../../firebase/config.js';
import { lockTuringAttempt } from '../../lib/submitResult.js';
import { recall, remember } from '../../lib/util.js';
import { Row, ScoreInput, SubmitBar } from './parts.jsx';

/**
 * 03 // TURING TIME
 * Two phases on one phone:
 *   PHASE 1 (participant)  three rounds, tap the response written by a human
 *   PHASE 2 (judge)        confirm each round, then submit
 *
 * THE ANTI-REFRESH RULE: the moment the participant continues to phase 2 we
 * write a create-once lock at attempts/{roll}_turing. Re-opening, refreshing or
 * re-entering the challenge cannot mint a fresh set of rounds. The lock is
 * best-effort by design: if the network is down the challenge continues (we
 * merely lose the extra protection) because a Wi-Fi hiccup must never be able
 * to stop the event.
 */
export default function TuringPanel({ participant, activity, config, sending, onSubmit }) {
  const rollId = participant?.rollId || 'anon';
  const key = `hvai.turing.${rollId}`;
  const rounds = useMemo(() => roundsForRoll(rollId, Number(config?.turingRounds) || 3), [rollId, config]);

  const [answers, setAnswers] = useState(() => recall(`${key}.answers`, {}));
  const [marks, setMarks] = useState(() => recall(`${key}.marks`, {}));
  const [phase, setPhase] = useState(() => (recall(`${key}.answers`, null) ? 'judge' : 'answer'));
  const [score, setScore] = useState('');
  const [error, setError] = useState('');
  const [lockNote, setLockNote] = useState('');

  const answered = rounds.filter((r) => answers[r.id] === 'A' || answers[r.id] === 'B').length;
  const allAnswered = answered === rounds.length;

  const isCorrect = (round) => {
    const marked = marks[round.id];
    if (marked === 'CORRECT') return true;
    if (marked === 'WRONG') return false;
    return answers[round.id] === round.human;
  };

  const correctCount = rounds.filter((round) => isCorrect(round)).length;
  const passMark = Number(config?.turingPassMark) || 2;
  const success = correctCount >= passMark;
  const suggestion = correctCount * 30;
  const shownScore = score === '' ? String(suggestion) : score;

  function pick(roundId, choice) {
    const next = { ...answers, [roundId]: choice };
    setAnswers(next);
    remember(`${key}.answers`, next);
  }

  async function handToJudge() {
    if (!allAnswered) {
      setError(`ANSWER ALL ${rounds.length} ROUNDS FIRST`);
      return;
    }
    setError('');
    setPhase('judge');
    const result = await lockTuringAttempt({ db, participant, rounds, answers });
    if (result && result.ok === false && result.code === 'ALREADY_EXISTS') {
      setLockNote('ATTEMPT ALREADY LOCKED — this is your original attempt.');
    } else if (result && result.ok === false) {
      setLockNote('ATTEMPT LOCK UNAVAILABLE (network) — continuing without it.');
    } else {
      setLockNote('ATTEMPT LOCKED. Refreshing can no longer grant extra rounds.');
    }
  }

  function submit() {
    setError('');
    if (!allAnswered) {
      setError('MISSING ROUND ANSWERS');
      return;
    }
    onSubmit({
      success,
      attemptsCorrect: correctCount,
      roundResults: rounds.map((round) => isCorrect(round)),
      score: Number(shownScore) || 0,
      metricLabel: `${correctCount}/${rounds.length}`,
    });
  }
  // ---------------------------------------------------------- PHASE 1: PLAY -
  if (phase === 'answer') {
    return (
      <Panel
        title={`${activity.no} // ${activity.name} — PARTICIPANT`}
        right={<Chip tone='warn'>{answered}/{rounds.length}</Chip>}
      >
        <Notice tone='neutral'>
          Three rounds. In each round one response was written by a human. Tap the HUMAN one.
        </Notice>
        {rounds.map((round, index) => (
          <div key={round.id} className='turing-round'>
            <div className='turing-head mono'>
              <span>ROUND {index + 1}</span>
              <span className='muted'>{rounds.length} rounds total</span>
            </div>
            <p className='turing-prompt'>{round.prompt}</p>
            {['A', 'B'].map((letter) => {
              const option = letter === 'A' ? round.a : round.b;
              const chosen = answers[round.id] === letter;
              return (
                <button
                  key={letter}
                  type='button'
                  className={`turing-option ${chosen ? 'is-on' : ''}`}
                  onClick={() => pick(round.id, letter)}
                  disabled={sending}
                >
                  <span className='turing-letter mono'>OPTION {letter}</span>
                  <span className='turing-text'>{option.text}</span>
                </button>
              );
            })}
          </div>
        ))}

        {error ? <p className='submit-error mono'>{error}</p> : null}
        <div className='submit-bar'>
          <button
            type='button'
            className='btn btn-xl btn-primary full'
            onClick={handToJudge}
            disabled={!allAnswered || sending}
          >
            HAND PHONE TO JUDGE
          </button>
          <p className='muted small center'>
            Answers lock at this point. Refreshing will not give you new rounds.
          </p>
        </div>
      </Panel>
    );
  }

  // --------------------------------------------------------- PHASE 2: JUDGE -
  return (
    <Panel
      title={`${activity.no} // ${activity.name} — JUDGE`}
      right={
        <Chip tone={success ? 'ok' : 'danger'}>
          {correctCount}/{rounds.length} {success ? 'PASS' : 'FAIL'}
        </Chip>
      }
    >
      {lockNote ? <Notice tone={lockNote.includes('UNAVAILABLE') ? 'warn' : 'ok'}>{lockNote}</Notice> : null}
      <Notice tone='neutral'>
        Confirm each round. Prefilled from the answer key — override only if the participant clearly chose otherwise.
      </Notice>

      {rounds.map((round, index) => (
        <div key={round.id} className='turing-round turing-review'>
          <div className='turing-head mono'>
            <span>ROUND {index + 1}</span>
            <span className='mono muted'>
              PICKED {answers[round.id] || '—'} · KEY {round.human}
            </span>
          </div>
          <p className='turing-prompt'>{round.prompt}</p>
          {['A', 'B'].map((letter) => {
            const option = letter === 'A' ? round.a : round.b;
            const picked = answers[round.id] === letter;
            return (
              <div key={letter} className={`turing-line ${picked ? 'is-picked' : ''}`}>
                <span className='turing-letter mono'>
                  {letter}
                  {round.human === letter ? <b className='keymark'>KEY</b> : null}
                  {picked ? <b className='pickmark'>← PICKED</b> : null}
                </span>
                <span className='turing-text'>{option.text}</span>
              </div>
            );
          })}
          <ToggleGroup
            value={marks[round.id] || (answers[round.id] === round.human ? 'CORRECT' : 'WRONG')}
            disabled={sending}
            onChange={(value) => {
              const next = { ...marks, [round.id]: value };
              setMarks(next);
              remember(`${key}.marks`, next);
            }}
            options={[
              { value: 'CORRECT', label: 'CORRECT', tone: 'ok' },
              { value: 'WRONG', label: 'INCORRECT', tone: 'danger' },
            ]}
          />
        </div>
      ))}

      <Row label='CORRECT'>
        <span className='mono score-big'>
          {correctCount} / {rounds.length}
        </span>
        <Chip tone={success ? 'ok' : 'danger'}>{success ? 'PASS' : 'FAIL'}</Chip>
      </Row>

      <ScoreInput label='FINAL SCORE' value={shownScore} onChange={setScore} suggestion={suggestion} />

      <SubmitBar
        sending={sending}
        onSubmit={submit}
        error={error}
        note={`Pass mark: ${passMark} of ${rounds.length} correct. One submission only.`}
      />
    </Panel>
  );
}