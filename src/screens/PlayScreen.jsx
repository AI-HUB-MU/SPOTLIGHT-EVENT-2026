import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';
import { useEvent } from '../state/EventContext.jsx';
import { Button, Chip, ErrorBox, GlitchTitle, GridBg, Notice, Panel, Scanlines, Spinner } from '../components/ui.jsx';
import { ACTIVITY_BY_ID, JUDGES } from '../data/activities.js';
import { db } from '../firebase/config.js';
import { hashPin } from '../lib/hash.js';
import { errorText, forget, recall, remember } from '../lib/util.js';
import { submitResult } from '../lib/submitResult.js';
import CaptchaPanel from './panels/CaptchaPanel.jsx';
import ConsolesPanel from './panels/ConsolesPanel.jsx';
import TuringPanel from './panels/TuringPanel.jsx';
import HearingPanel from './panels/HearingPanel.jsx';

const PANELS = {
  captcha: CaptchaPanel,
  consoles: ConsolesPanel,
  turing: TuringPanel,
  hearing: HearingPanel,
};

/**
 * THE JUDGE FLOW  (three steps, one screen)
 *   STEP 1  participant picks one of the six judges
 *   STEP 2  that judge types the shared access code
 *   STEP 3  the judge evaluates and submits
 *
 * Everything the judge needs is above the fold, buttons are large, and the
 * submit button is guarded by a ref so a double tap can never double-write.
 */
export default function PlayScreen() {
  const { activityId } = useParams();
  const navigate = useNavigate();
  const { participant, participantReady } = useAuth();
  const { config, pin, frozen } = useEvent();

  const activity = ACTIVITY_BY_ID[activityId];
  const rollId = participant?.rollId || 'anon';
  const keys = useMemo(
    () => ({
      step: `hvai.step.${rollId}.${activityId}`,
      judge: `hvai.judge.${rollId}.${activityId}`,
      pin: `hvai.pin.${rollId}.${activityId}`,
    }),
    [rollId, activityId]
  );

  const [step, setStep] = useState(() => recall(keys.step, 'judge'));
  const [judgeId, setJudgeId] = useState(() => recall(keys.judge, null));
  const [pinOk, setPinOk] = useState(() => recall(keys.pin, false) === true);
  const [pinValue, setPinValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitState, setSubmitState] = useState('idle'); // idle | sending | done | error
  const [outcome, setOutcome] = useState(null);
  const inFlight = useRef(false);

  const goStep = useCallback(
    (next) => {
      setStep(next);
      remember(keys.step, next);
    },
    [keys.step]
  );

  const verifyPin = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (!pin) throw new Error('NO JUDGE PIN HAS BEEN SET. Ask the admin.');
      const entered = String(pinValue).trim();
      if (!entered) throw new Error('ENTER THE ACCESS CODE.');
      if (hashPin(pin.salt, entered) !== pin.pinHash) throw new Error('WRONG ACCESS CODE.');
      setPinOk(true);
      remember(keys.pin, true);
      setPinValue('');
      goStep('run');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [busy, goStep, keys.pin, pin, pinValue]);

  const handleSubmit = useCallback(
    async (result) => {
      if (inFlight.current || submitState === 'sending' || submitState === 'done') return;
      inFlight.current = true;
      setSubmitState('sending');
      setError('');
      try {
        const response = await submitResult({
          db,
          participant,
          activityId,
          activityName: activity?.name,
          judgeId,
          pinVersion: pin ? pin.pinVersion : null,
          result,
          config,
        });
        setOutcome(response);
        setSubmitState('done');
        forget(keys.step);
        forget(keys.judge);
        forget(keys.pin);
      } catch (err) {
        setSubmitState('error');
        setError(errorText(err));
      } finally {
        inFlight.current = false;
      }
    },
    [activity?.name, activityId, config, judgeId, keys, participant, pin, submitState]
  );
  // -------------------------------------------------------------- guards ---
  if (!participantReady) return <Spinner label='SYNCING…' />;

  if (!activity) {
    return (
      <div className='shell shell-center'>
        <GridBg />
        <Scanlines />
        <Panel title='UNKNOWN CHALLENGE' tone='danger' className='narrow'>
          <Button className='full' onClick={() => navigate('/participate')}>
            BACK TO CHALLENGES
          </Button>
        </Panel>
      </div>
    );
  }

  const record = (participant?.completed || {})[activityId];
  const PanelImpl = PANELS[activityId];

  // --------------------------------------------------- already recorded ----
  // The durable duplicate-submission guard on the client side. The real guard
  // is the create-once document id + security rules on the server.
  if (record && submitState !== 'done') {
    return (
      <div className='shell shell-center'>
        <GridBg />
        <Scanlines />
        <Panel title='CHALLENGE COMPLETE' tone='ok' className='narrow'>
          <div className='done-block'>
            <span className='done-mark'>✓</span>
            <h3>{activity.name}</h3>
            <p className='mono'>
              {record.success ? 'PASS' : 'FAIL'} · SCORE {record.score}
              {record.metricLabel ? ` · ${record.metricLabel}` : ''}
            </p>
            <p className='muted small'>
              Judge {record.judgeId}. A recorded challenge cannot be submitted twice.
            </p>
            <Button className='full' onClick={() => navigate('/participate')}>
              BACK TO CHALLENGES
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  // ------------------------------------------------------------ submitted --
  if (submitState === 'done') {
    return (
      <div className='shell shell-center'>
        <GridBg />
        <Scanlines />
        <Panel title='RESULT TRANSMITTED' tone='ok' className='narrow'>
          <div className='done-block'>
            <span className='done-mark'>✓</span>
            <h3>{outcome?.success ? 'HUMAN VICTORY' : 'AI GAINS GROUND'}</h3>
            <p className='mono'>
              HUMANITY {outcome?.humanPower}% · AI {outcome?.aiPower}%
            </p>
            <p className='muted small'>
              Recorded by judge {judgeId}.{' '}
              {outcome?.success
                ? 'Resistance strengthened.'
                : 'Every failure still costs the AI more than it costs humanity.'}
            </p>
            <Button size='lg' className='full' onClick={() => navigate('/participate')}>
              RETURN PHONE TO PARTICIPANT
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const stepIndex = step === 'judge' ? 1 : step === 'pin' ? 2 : 3;

  return (
    <div className='shell'>
      <GridBg />
      <Scanlines />
      <header className='hud-top'>
        <button type='button' className='link-btn' onClick={() => navigate('/participate')}>
          ← ABORT
        </button>
        <span className='hud-roll mono'>STEP {stepIndex}/3</span>
      </header>

      <main className='stack'>
        {frozen ? (
          <Notice tone='warn'>
            ADMIN HAS PAUSED NEW SUBMISSIONS. An attempt already in progress will still be recorded.
          </Notice>
        ) : null}

        {step === 'judge' ? (
          <Panel title='STEP 1 // SELECT YOUR JUDGE' className='narrow'>
            <div className='judge-grid'>
              {JUDGES.map((judge) => (
                <button
                  key={judge}
                  type='button'
                  className={`judge-btn ${judgeId === judge ? 'is-on' : ''}`}
                  onClick={() => {
                    setJudgeId(judge);
                    remember(keys.judge, judge);
                    goStep('pin');
                  }}
                >
                  {judge}
                </button>
              ))}
            </div>
            <p className='muted small center'>Hand the phone to this judge. They enter the access code.</p>
          </Panel>
        ) : null}

        {step === 'pin' ? (
          <Panel title={`STEP 2 // JUDGE ACCESS CODE — ${judgeId || 'UNSET'}`} className='narrow'>
            {!pin ? (
              <Notice tone='danger'>NO JUDGE PIN HAS BEEN SET. Ask the admin to set it in the command centre.</Notice>
            ) : null}
            <form
              className='form'
              onSubmit={(event) => {
                event.preventDefault();
                verifyPin();
              }}
            >
              <input
                className='input pin-input mono'
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value)}
                placeholder='ACCESS CODE'
                type='password'
                autoComplete='off'
              />
              <ErrorBox onDismiss={() => setError('')}>{error}</ErrorBox>
              <Button size='lg' className='full' busy={busy} onClick={verifyPin}>
                UNLOCK JUDGE CONSOLE
              </Button>
              <button
                type='button'
                className='link-btn small center'
                onClick={() => {
                  setJudgeId(null);
                  forget(keys.judge);
                  goStep('judge');
                }}
              >
                ← change judge
              </button>
            </form>
          </Panel>
        ) : null}

        {step === 'run' && pinOk && PanelImpl ? (
          <>
            <div className='judge-header mono'>
              <div className='jh-cell'>
                <span className='jh-k'>PARTICIPANT</span>
                <span className='jh-v'>{participant?.name || '--'}</span>
              </div>
              <div className='jh-cell'>
                <span className='jh-k'>ROLL NUMBER</span>
                <span className='jh-v'>{rollId}</span>
              </div>
              <div className='jh-cell'>
                <span className='jh-k'>ACTIVITY</span>
                <span className='jh-v'>{activity.name}</span>
              </div>
              <div className='jh-cell'>
                <span className='jh-k'>JUDGE</span>
                <span className='jh-v'>{judgeId}</span>
              </div>
            </div>

            <ErrorBox onDismiss={() => setError('')}>{error}</ErrorBox>
            <Chip tone={submitState === 'sending' ? 'warn' : 'neutral'}>
              {submitState === 'sending' ? 'TRANSMITTING TO CONTAINMENT GRID…' : 'READY FOR EVALUATION'}
            </Chip>

            <PanelImpl
              participant={participant}
              activity={activity}
              judgeId={judgeId}
              config={config}
              sending={submitState === 'sending'}
              onSubmit={handleSubmit}
            />
          </>
        ) : null}

        {step === 'run' && !pinOk ? (
          <Panel title='JUDGE CONSOLE LOCKED' tone='danger' className='narrow'>
            <p>Re-enter the judge access code to continue.</p>
            <Button className='full' onClick={() => goStep('pin')}>
              ENTER ACCESS CODE
            </Button>
          </Panel>
        ) : null}
      </main>
    </div>
  );
}