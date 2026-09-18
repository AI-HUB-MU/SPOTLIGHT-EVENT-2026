import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';
import { useEvent } from '../state/EventContext.jsx';
import { Button, Chip, GridBg, Panel, Scanlines } from '../components/ui.jsx';
import { ACTIVITIES } from '../data/activities.js';
import { recall } from '../lib/util.js';

export default function ParticipateScreen() {
  const { participant } = useAuth();
  const { frozen } = useEvent();
  const navigate = useNavigate();

  function statusFor(activity) {
    const record = (participant?.completed || {})[activity.id];
    if (record) return { key: 'COMPLETED', tone: 'ok', note: record.metricLabel || '' };
    if (frozen) return { key: 'LOCKED', tone: 'warn', note: 'admin paused' };
    if (recall(`hvai.step.${participant?.rollId}.${activity.id}`, null) === 'run') {
      return { key: 'IN PROGRESS', tone: 'warn', note: 'resume' };
    }
    return { key: 'AVAILABLE', tone: 'neutral', note: '' };
  }

  return (
    <div className='shell'>
      <GridBg />
      <Scanlines />
      <header className='hud-top'>
        <button type='button' className='link-btn' onClick={() => navigate('/home')}>
          ← BACK
        </button>
        <span className='hud-roll mono'>{participant?.name || ''}</span>
      </header>

      <main className='stack'>
        <div className='section-head'>
          <span className='eyebrow'>SELECT CHALLENGE // 04 TARGETS</span>
          <h2 className='section-title'>CHALLENGE DECK</h2>
        </div>

        {ACTIVITIES.map((activity) => {
          const status = statusFor(activity);
          const done = status.key === 'COMPLETED';
          return (
            <Panel key={activity.id} className={`card ${done ? 'card-done' : ''}`}>
              <div className='card-row'>
                <div className='card-no mono'>{activity.no}</div>
                <div className='card-body'>
                  <h3 className='card-title'>{activity.name}</h3>
                  <p className='card-tagline'>{activity.tagline}</p>
                  <p className='card-blurb'>{activity.blurb}</p>
                  <div className='card-meta'>
                    <Chip tone={status.tone}>{status.key}</Chip>
                    {status.note ? <span className='muted small mono'>{status.note}</span> : null}
                  </div>
                </div>
              </div>
              <Button
                size='lg'
                className='full'
                variant={done ? 'ghost' : 'primary'}
                disabled={done || frozen}
                onClick={() => navigate(`/play/${activity.id}`)}
              >
                {done ? 'COMPLETED ✓' : frozen ? 'PAUSED' : status.key === 'IN PROGRESS' ? 'RESUME' : 'PLAY'}
              </Button>
            </Panel>
          );
        })}

        <p className='muted small center'>
          The judge holds your phone while evaluating. Results are final unless an admin reopens the attempt.
        </p>
      </main>
    </div>
  );
}
