/** Small shared UI kit. Deliberately dependency-free (CSS only). */

export function Scanlines() {
  return <div className='fx-scanlines' aria-hidden='true' />;
}

export function GridBg() {
  return <div className='fx-grid' aria-hidden='true' />;
}

export function GlitchTitle({ children, className = '' }) {
  const text = typeof children === 'string' ? children : '';
  return (
    <h1 className={`glitch ${className}`} data-text={text}>
      {children}
    </h1>
  );
}

export function Panel({ title, right, children, className = '', tone = '' }) {
  return (
    <section className={`panel ${tone ? `tone-${tone}` : ''} ${className}`}>
      {(title || right) && (
        <header className='panel-hd'>
          <span className='panel-title'>{title}</span>
          {right ? <span className='panel-right'>{right}</span> : null}
        </header>
      )}
      <div className='panel-bd'>{children}</div>
    </section>
  );
}

export function Chip({ tone = 'neutral', children, className = '' }) {
  return <span className={`chip chip-${tone} ${className}`}>{children}</span>;
}

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  disabled = false,
  children,
  className = '',
  ...rest
}) {
  return (
    <button
      type='button'
      className={`btn btn-${variant} btn-${size} ${className}`}
      disabled={disabled || busy}
      {...rest}
    >
      {busy ? <span className='btn-spin' aria-hidden='true' /> : null}
      <span>{children}</span>
    </button>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className='field'>
      <span className='field-label'>{label}</span>
      {children}
      {hint ? <span className='field-hint'>{hint}</span> : null}
    </label>
  );
}

export function Stat({ label, value, tone = '', sub }) {
  return (
    <div className={`stat ${tone ? `tone-${tone}` : ''}`}>
      <span className='stat-key'>{label}</span>
      <span className='stat-val'>{value}</span>
      {sub ? <span className='stat-sub'>{sub}</span> : null}
    </div>
  );
}

export function Spinner({ label = 'LOADING…' }) {
  return (
    <div className='spinner'>
      <span className='spinner-ring' aria-hidden='true' />
      <span className='spinner-label'>{label}</span>
    </div>
  );
}

export function ErrorBox({ children, onDismiss }) {
  if (!children) return null;
  return (
    <div className='errorbox' role='alert'>
      <span className='errorbox-text'>{children}</span>
      {onDismiss ? (
        <button type='button' className='errorbox-x' onClick={onDismiss} aria-label='Dismiss'>
          ×
        </button>
      ) : null}
    </div>
  );
}

export function Notice({ tone = 'warn', children }) {
  if (!children) return null;
  return <div className={`notice notice-${tone}`}>{children}</div>;
}

export function Confirm({ open, title, body, confirmLabel = 'CONFIRM', tone = 'danger', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className='modal-backdrop' role='dialog' aria-modal='true'>
      <div className='modal'>
        <h3 className='modal-title'>{title}</h3>
        <div className='modal-body'>{body}</div>
        <div className='modal-actions'>
          <Button variant='ghost' onClick={onCancel}>
            CANCEL
          </Button>
          <Button variant={tone} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BigTimer({ value, label, tone = 'neutral' }) {
  return (
    <div className={`bigtimer tone-${tone}`}>
      {label ? <span className='bigtimer-label'>{label}</span> : null}
      <span className='bigtimer-value mono'>{value}</span>
    </div>
  );
}

export function ToggleGroup({ options, value, onChange, disabled = false }) {
  return (
    <div className='toggle-group'>
      {options.map((option) => (
        <button
          key={option.value}
          type='button'
          className={`toggle ${value === option.value ? 'is-on' : ''} ${option.tone ? `tone-${option.tone}` : ''}`}
          onClick={() => !disabled && onChange(option.value)}
          disabled={disabled}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className='progress' aria-label={`${done} of ${total} challenges complete`}>
      <div className='progress-fill' style={{ width: `${pct}%` }} />
      <span className='progress-text'>
        {done}/{total} CHALLENGES CLEARED
      </span>
    </div>
  );
}
