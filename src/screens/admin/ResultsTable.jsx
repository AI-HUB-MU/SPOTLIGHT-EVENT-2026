import { Chip, Panel } from '../../components/ui.jsx';
import { ACTIVITY_BY_ID } from '../../data/activities.js';
import { formatClockTime } from '../../lib/util.js';

/** The authoritative result list: correct a score, or void + reopen an attempt. */
export default function ResultsTable({ progress, busy, onCorrect, onVoid }) {
  const rows = [...progress].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)).slice(0, 40);

  return (
    <Panel title='RECORDED RESULTS (SOURCE OF TRUTH)' right={<Chip tone='neutral'>{progress.length} total</Chip>}>
      {rows.length === 0 ? (
        <p className='muted small'>No results recorded yet.</p>
      ) : (
        <div className='table-wrap'>
          <table className='table'>
            <thead>
              <tr>
                <th>ROLL</th>
                <th>NAME</th>
                <th>ACTIVITY</th>
                <th>VALUE</th>
                <th>SCORE</th>
                <th>RESULT</th>
                <th>JUDGE</th>
                <th>AT</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className='mono'>{row.rollId}</td>
                  <td>{row.participantName || '—'}</td>
                  <td>{ACTIVITY_BY_ID[row.activityId]?.name || row.activityId}</td>
                  <td className='mono'>{row.metricLabel || '—'}</td>
                  <td className='mono'>{row.score}</td>
                  <td>
                    <Chip tone={row.success ? 'ok' : 'danger'}>{row.success ? 'PASS' : 'FAIL'}</Chip>
                  </td>
                  <td>{row.judgeId || '—'}</td>
                  <td className='mono'>{formatClockTime(row.createdAtMs)}</td>
                  <td className='actions'>
                    <button
                      type='button'
                      className='link-btn'
                      disabled={Boolean(busy)}
                      onClick={() => onCorrect(row)}
                    >
                      CORRECT
                    </button>
                    <button
                      type='button'
                      className='link-btn danger'
                      disabled={Boolean(busy)}
                      onClick={() => onVoid(row)}
                    >
                      VOID
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className='muted small'>
        VOID deletes the progress lock so the participant can attempt that challenge again, and rebuilds the bar from
        the remaining results. The original entry stays in the submissions log forever.
      </p>
    </Panel>
  );
}
