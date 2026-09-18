import { useEffect, useState } from 'react';
import { Button, Chip, Field, Notice, Panel, ToggleGroup } from '../../components/ui.jsx';
import { ACTIVITIES } from '../../data/activities.js';

/** Every privileged control, grouped and labelled for use under pressure. */
export default function AdminControls({
  state,
  config,
  pin,
  frozen,
  busy,
  onChangeBar,
  onResetBar,
  onRebuild,
  onSetMode,
  onSaveConfig,
  onSavePin,
  onRebind,
  onExport,
}) {
  const [exact, setExact] = useState('');
  const [newPin, setNewPin] = useState('');
  const [rebindRoll, setRebindRoll] = useState('');
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!config) return;
    setForm({
      baseHuman: config.baseHuman,
      decayPerMinute: config.decayPerMinute,
      aiCreepEnabled: Boolean(config.aiCreepEnabled),
      hearingSeconds: config.hearingSeconds,
      turingPassMark: config.turingPassMark,
      humanGain: { ...config.humanGain },
      aiGain: { ...config.aiGain },
    });
  }, [config]);

  function setGain(kind, activityId, value) {
    setForm((f) => ({ ...f, [kind]: { ...f[kind], [activityId]: Number(value) || 0 } }));
  }

  return (
    <>
      <Panel
        title='BAR OVERRIDE'
        right={<Chip tone={frozen ? 'warn' : 'ok'}>{frozen ? 'SUBMISSIONS FROZEN' : 'LIVE'}</Chip>}
      >
        <div className='row wrap gap'>
          <Button size='md' variant='ghost' disabled={busy} onClick={() => onChangeBar(-5)}>
            AI +5
          </Button>
          <Button size='md' variant='ghost' disabled={busy} onClick={() => onChangeBar(-1)}>
            AI +1
          </Button>
          <Button size='md' variant='ghost' disabled={busy} onClick={() => onChangeBar(1)}>
            HUMAN +1
          </Button>
          <Button size='md' variant='ghost' disabled={busy} onClick={() => onChangeBar(5)}>
            HUMAN +5
          </Button>
          <Button size='md' variant='ghost' disabled={busy} onClick={() => onResetBar({})}>
            RESET TO BASE
          </Button>
        </div>
        <div className='row gap mt'>
          <input
            className='input mono narrow-input'
            value={exact}
            onChange={(e) => setExact(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder='68'
            inputMode='numeric'
          />
          <Button
            size='md'
            variant='warn'
            disabled={busy || exact === ''}
            onClick={() => {
              onChangeBar(Number(exact) - Number(state?.humanPower || 0));
              setExact('');
            }}
          >
            SET HUMAN % EXACTLY
          </Button>
          <Button
            size='md'
            variant={frozen ? 'ok' : 'danger'}
            disabled={busy}
            onClick={() => onSetMode(frozen ? 'LIVE' : 'FROZEN')}
          >
            {frozen ? 'RESUME SUBMISSIONS' : 'FREEZE SUBMISSIONS'}
          </Button>
        </div>
        <p className='muted small'>
          Hard limits enforced by security rules: HUMAN never below 54, AI never above 46, and they always sum to 100.
        </p>
      </Panel>

      <Panel title='REPAIR + RESET'>
        <div className='row wrap gap'>
          <Button size='md' variant='warn' disabled={busy} onClick={onRebuild}>
            RECALCULATE FROM LOGS
          </Button>
          <Button size='md' variant='danger' disabled={busy} onClick={() => onResetBar({ hard: true })}>
            RESET EVENT BAR + WINS
          </Button>
        </div>
        <Notice tone='warn'>
          RECALCULATE rebuilds the bar and every participant total from the recorded results - use it if anything ever
          looks wrong. RESET zeros the bar and win counters; participant progress is kept.
        </Notice>
      </Panel>

      <Panel title='JUDGE ACCESS CODE' right={<Chip tone='neutral'>v{pin?.pinVersion || 1}</Chip>}>
        <div className='row gap'>
          <input
            className='input'
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            placeholder='new shared code (6+ characters)'
            autoComplete='off'
          />
          <Button
            size='md'
            variant='warn'
            disabled={busy || String(newPin).trim().length < 4}
            onClick={() => {
              onSavePin(String(newPin).trim());
              setNewPin('');
            }}
          >
            SET / ROTATE PIN
          </Button>
        </div>
        <p className='muted small'>
          Only a salted SHA-256 hash is stored - never the code itself. Tell all six judges immediately after rotating.
        </p>
      </Panel>

      <Panel title='UNLOCK A ROLL NUMBER (FORGOT PASSWORD)'>
        <div className='row gap'>
          <input
            className='input mono'
            value={rebindRoll}
            onChange={(e) => setRebindRoll(e.target.value.toUpperCase())}
            placeholder='23XXXX'
          />
          <Button
            size='md'
            variant='warn'
            disabled={busy || rebindRoll.trim().length < 3}
            onClick={() => {
              onRebind(rebindRoll.trim());
              setRebindRoll('');
            }}
          >
            ALLOW ONE REBIND
          </Button>
        </div>
        <p className='muted small'>
          The participant signs in again with the same roll number and a new password, keeping all their progress.
        </p>
      </Panel>

      {form ? (
        <Panel title='BATTLE TUNING' right={<Chip tone='neutral'>no redeploy needed</Chip>}>
          <div className='grid2'>
            <Field label='BASE HUMAN % (start + drift target)'>
              <input
                className='input mono'
                value={form.baseHuman}
                onChange={(e) => setForm({ ...form, baseHuman: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })}
                inputMode='numeric'
              />
            </Field>
            <Field label='AI DRIFT PER MINUTE' hint='event-driven creep, not a background timer'>
              <input
                className='input mono'
                value={form.decayPerMinute}
                onChange={(e) => setForm({ ...form, decayPerMinute: Number(e.target.value) || 0 })}
                inputMode='decimal'
              />
            </Field>
            <Field label='HEARING TIMER (SECONDS)'>
              <input
                className='input mono'
                value={form.hearingSeconds}
                onChange={(e) => setForm({ ...form, hearingSeconds: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })}
                inputMode='numeric'
              />
            </Field>
            <Field label='TURING PASS MARK (ROUNDS)'>
              <input
                className='input mono'
                value={form.turingPassMark}
                onChange={(e) => setForm({ ...form, turingPassMark: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })}
                inputMode='numeric'
              />
            </Field>
          </div>

          <Field label='AI CREEP (DRIFT TOWARD BASE WHEN THE HALL GOES QUIET)'>
            <ToggleGroup
              value={form.aiCreepEnabled}
              onChange={(v) => setForm({ ...form, aiCreepEnabled: v })}
              options={[
                { value: true, label: 'ENABLED', tone: 'danger' },
                { value: false, label: 'DISABLED', tone: 'ok' },
              ]}
            />
          </Field>

          <div className='table-wrap'>
            <table className='table'>
              <thead>
                <tr>
                  <th>ACTIVITY</th>
                  <th>PASS: HUMAN +</th>
                  <th>FAIL: AI +</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVITIES.map((activity) => (
                  <tr key={activity.id}>
                    <td>{activity.name}</td>
                    <td>
                      <input
                        className='input mono tiny-input'
                        value={form.humanGain[activity.id] ?? 0}
                        onChange={(e) => setGain('humanGain', activity.id, e.target.value.replace(/[^0-9]/g, ''))}
                        inputMode='numeric'
                      />
                    </td>
                    <td>
                      <input
                        className='input mono tiny-input'
                        value={form.aiGain[activity.id] ?? 0}
                        onChange={(e) => setGain('aiGain', activity.id, e.target.value.replace(/[^0-9]/g, ''))}
                        inputMode='numeric'
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button size='md' variant='warn' disabled={busy} onClick={() => onSaveConfig(form)}>
            SAVE BATTLE TUNING
          </Button>
          <p className='muted small'>
            Keep human gains HIGHER than AI gains - humanity must always be able to come back.
          </p>
        </Panel>
      ) : null}

      <Panel title='EXPORT (OFFLINE FALLBACK)'>
        <div className='row wrap gap'>
          <Button size='md' variant='ghost' onClick={() => onExport('participants')}>
            PARTICIPANTS CSV
          </Button>
          <Button size='md' variant='ghost' onClick={() => onExport('results')}>
            RESULTS CSV
          </Button>
          <Button size='md' variant='ghost' onClick={() => onExport('submissions')}>
            SUBMISSIONS CSV
          </Button>
        </div>
        <p className='muted small'>Download these before the finals. Paper beats a dead router.</p>
      </Panel>
    </>
  );
}