import { Chip, Panel } from '../../components/ui.jsx';
import { formatClockTime } from '../../lib/util.js';

/** Live feed: newest submissions first, plus the admin action log. */
export default function RecentFeed({ submissions, audit }) {
  return (
    <div className='grid2'>
      <Panel title='RECENT SUBMISSIONS' right={<Chip tone='neutral'>{submissions.length}</Chip>}>
        {submissions.length === 0 ? (
          <p className='muted small'>Nothing submitted yet.</p>
        ) : (
          <div className='table-wrap'>
            <table className='table'>
              <thead>
                <tr>
                  <th>PARTICIPANT</th>
                  <th>ROLL</th>
                  <th>ACTIVITY</th>
                  <th>JUDGE</th>
                  <th>VALUE</th>
                  <th>RESULT</th>
                  <th>TIME</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.participantName || '—'}</td>
                    <td className='mono'>{row.rollId}</td>
                    <td>{row.activityName || row.activityId}</td>
                    <td>{row.judgeId || '—'}</td>
                    <td className='mono'>{row.metricLabel || row.score}</td>
                    <td>
                      <Chip tone={row.success ? 'ok' : 'danger'}>{row.success ? 'PASS' : 'FAIL'}</Chip>
                    </td>
                    <td className='mono'>{formatClockTime(row.createdAtMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title='ADMIN ACTION LOG' right={<Chip tone='warn'>{audit.length}</Chip>}>
        {audit.length === 0 ? (
          <p className='muted small'>No privileged actions yet.</p>
        ) : (
          <ul className='log'>
            {audit.map((row) => (
              <li key={row.id} className='log-row'>
                <span className='mono muted'>{formatClockTime(row.createdAtMs)}</span>
                <span className={`log-action tone-${row.action === 'SUBMIT' ? 'neutral' : 'warn'}`}>{row.action}</span>
                <span className='log-summary'>{row.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
