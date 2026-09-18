import { Chip, Panel } from '../../components/ui.jsx';

/** Per-activity leaderboards, top 3, computed in memory (no indexes needed). */
export default function Leaderboards({ leaderboards }) {
  return (
    <div className='grid2'>
      {leaderboards.map(({ activity, top, count }) => (
        <Panel
          key={activity.id}
          title={`${activity.no} // ${activity.name}`}
          right={<Chip tone='neutral'>{count} results</Chip>}
        >
          {top.length === 0 ? (
            <p className='muted small'>No results yet.</p>
          ) : (
            <ol className='lb'>
              {top.map((row, index) => (
                <li key={`${row.rollId}-${index}`} className='lb-row'>
                  <span className='lb-rank mono'>{index + 1}</span>
                  <span className='lb-name'>
                    {row.name}
                    <span className='mono muted'> {row.rollId}</span>
                  </span>
                  <span className={`lb-value mono ${row.success ? 'ok' : 'danger'}`}>
                    {row.success ? row.label : `FAIL`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      ))}
    </div>
  );
}
