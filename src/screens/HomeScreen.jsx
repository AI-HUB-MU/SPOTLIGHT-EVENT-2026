import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';
import { useEvent, useNow } from '../state/EventContext.jsx';
import { HealthBar } from '../components/HealthBar.jsx';
import { Button, Chip, GlitchTitle, GridBg, Panel, Progress, Scanlines, Spinner, Stat } from '../components/ui.jsx';
import { ACTIVITIES } from '../data/activities.js';
import { tickerLines } from '../data/aiMessages.js';

export default function HomeScreen() {
  const { participant, participantReady, logout } = useAuth();
  const { human, ai, status, threat, frozen, totalSubmissions, humanWins, aiWins, lastSubmissionAt } = useEvent();
  const navigate = useNavigate();
  const now = useNow(6000);

  const lines = tickerLines(status.key);
  const ticker = lines[Math.floor(now / 6000) % lines.length];

  const completedCount = Number(participant?.completedCount) || 0;
  const totalScore = Number(participant?.totalScore) || 0;
  const wins = Number(participant?.passedCount) || 0;

  const unlocked = useMemo(
    () => ACTIVITIES.filter((a) => !(participant?.completed || {})[a.id]).length,
    [participant]
  );

  if (!participantReady) return <Spinner label='SYNCING PARTICIPANT RECORD…' />;

  return (
    <div className='shell'>
      <GridBg />
      <Scanlines />

      <header className='hud-top'>
        <div className='hud-id'>
          <span className='hud-name'>{participant?.name || 'UNKNOWN'}</span>
          <span className='hud-roll mono'>ROLL {participant?.rollId || '--'}</span>
        </div>
        <button type='button' className='link-btn' onClick={logout}>
          SIGN OUT
        </button>
      </header>

      <main className='stack'>
        <section className='battle'>
          <span className='eyebrow'>GLOBAL BATTLE STATUS // LIVE</span>
          <GlitchTitle className='battle-title'>HUMANS vs AI</GlitchTitle>
          <HealthBar
            human={human}
            ai={ai}
            status={status}
            threat={threat}
            lastSubmissionAt={lastSubmissionAt}
          />
          <div className='ticker mono'>
            <span className='ticker-dot' aria-hidden='true' />
            {ticker}
          </div>
          {frozen ? <Chip tone='warn'>SUBMISSIONS PAUSED BY ADMIN</Chip> : null}
        </section>

        <div className='grid2'>
          <Stat label='YOUR SCORE' value={totalScore} tone='ok' />
          <Stat label='CHALLENGES CLEARED' value={`${completedCount}/${ACTIVITIES.length}`} />
          <Stat label='ROUNDS WON' value={wins} />
          <Stat label='EVENT SUBMISSIONS' value={totalSubmissions} sub={`${humanWins} human / ${aiWins} ai`} />
        </div>

        <Progress done={completedCount} total={ACTIVITIES.length} />

        <Panel className='cta-panel'>
          <p className='objective'>
            OBJECTIVE: DEFEND HUMANITY. Complete the four challenges. Every success pushes the AI back.
          </p>
          <Button size='xl' className='full' onClick={() => navigate('/participate')} disabled={frozen}>
            {completedCount >= ACTIVITIES.length ? 'VIEW CHALLENGES' : 'PARTICIPATE'}
          </Button>
          <p className='muted small center'>
            {unlocked > 0 ? `${unlocked} challenge(s) still available to you.` : 'All four challenges recorded. Legend.'}
          </p>
        </Panel>
      </main>
    </div>
  );
}
