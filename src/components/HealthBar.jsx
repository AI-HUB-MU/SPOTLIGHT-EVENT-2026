import { useMemo } from 'react';
import { useNow } from '../state/EventContext.jsx';
import { formatAgo } from '../lib/util.js';

/**
 * THE GLOBAL BATTLE BAR.
 * Purely presentational: it renders whatever eventState/main says, so every
 * screen in the hall shows the same numbers within a few hundred milliseconds.
 */
export function HealthBar({ human, ai, status, threat = 0, size = 'lg', lastSubmissionAt = null }) {
  const now = useNow(10000);
  const segments = useMemo(() => {
    const out = [];
    for (let i = 1; i < 20; i += 1) out.push(i * 5);
    return out;
  }, []);

  return (
    <div className={`bar bar-${size}`} style={{ '--threat': threat }}>
      <div className='bar-head'>
        <span className='bar-side human'>
          HUMANITY <b className='mono'>{human}%</b>
        </span>
        <span className='bar-side ai'>
          AI <b className='mono'>{ai}%</b>
        </span>
      </div>

      <div
        className='bar-track'
        role='meter'
        aria-valuemin={54}
        aria-valuemax={100}
        aria-valuenow={human}
        aria-label={`Humanity ${human} percent, AI ${ai} percent`}
      >
        <div className='bar-human' style={{ width: `${human}%` }}>
          <span className='bar-glow' />
        </div>
        <div className='bar-ai' style={{ width: `${ai}%` }} />
        <div className='bar-segments'>
          {segments.map((left) => (
            <span key={left} className='bar-segment' style={{ left: `${left}%` }} />
          ))}
        </div>
        <div className='bar-sweep' />
      </div>

      <div className='bar-foot'>
        <span className={`bar-status tone-${status.tone}`}>{status.label}</span>
        <span className='bar-meta mono'>
          {lastSubmissionAt ? `LAST SIGNAL ${formatAgo(lastSubmissionAt, now)}` : 'AWAITING FIRST SIGNAL'}
        </span>
      </div>
    </div>
  );
}

export default HealthBar;
