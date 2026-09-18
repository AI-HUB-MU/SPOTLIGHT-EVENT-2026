import { Button, Field } from '../../components/ui.jsx';
import { parseClock, parseRace } from '../../lib/util.js';

// Re-exported so the four activity panels can keep importing everything from parts.jsx.
export { Field };

// Parsing lives in lib/util.js so tools/selftest.mjs can unit-test it without JSX.
export { parseClock, parseRace };

export function Row({ label, children, hint }) {
  return (
    <div className='judge-row'>
      <span className='judge-row-label'>{label}</span>
      <div className='judge-row-body'>{children}</div>
      {hint ? <span className='field-hint'>{hint}</span> : null}
    </div>
  );
}

export function ScoreInput({ value, onChange, suggestion, label = 'SCORE' }) {
  return (
    <Field label={label} hint={suggestion !== undefined ? `suggested ${suggestion} — override if needed` : undefined}>
      <div className='score-row'>
        <input
          className='input score-input mono'
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode='numeric'
          placeholder='0'
        />
        {suggestion !== undefined ? (
          <button type='button' className='link-btn' onClick={() => onChange(String(suggestion))}>
            USE {suggestion}
          </button>
        ) : null}
      </div>
    </Field>
  );
}

/**
 * The single submit control used by all four challenges.
 * `sending` is driven by the parent's submission state machine, which also
 * holds a ref guard - so a double tap, a slow network and a re-render cannot
 * produce a second write.
 */
export function SubmitBar({ sending, disabled, onSubmit, label = 'SUBMIT RESULT', note, error }) {
  return (
    <div className='submit-bar'>
      {error ? <p className='submit-error mono'>{error}</p> : null}
      {note ? <p className='muted small center'>{note}</p> : null}
      <Button
        size='xl'
        className='full'
        busy={sending}
        disabled={Boolean(disabled) || sending}
        onClick={onSubmit}
      >
        {sending ? 'TRANSMITTING…' : label}
      </Button>
      {sending ? <p className='muted small center'>Do not close this screen.</p> : null}
    </div>
  );
}
