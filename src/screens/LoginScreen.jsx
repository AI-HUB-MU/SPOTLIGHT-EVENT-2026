import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';
import { Button, ErrorBox, Field, GlitchTitle, GridBg, Panel, Scanlines } from '../components/ui.jsx';
import { CONFIG_MISSING } from '../firebase/config.js';

export default function LoginScreen() {
  const { loginAsParticipant } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('AUTHENTICATING…');
    const result = await loginAsParticipant({ name, roll, password });
    setBusy(false);
    if (result.ok) {
      setStatus('ACCESS GRANTED');
      navigate('/home', { replace: true });
    } else {
      setStatus('');
      setError(result.message);
    }
  }

  if (CONFIG_MISSING) {
    return (
      <div className='shell shell-center'>
        <GridBg />
        <Scanlines />
        <Panel title='SYSTEM NOT CONFIGURED' tone='danger' className='narrow'>
          <p>Firebase credentials are missing, so the containment field cannot start.</p>
          <ol className='steps'>
            <li>
              Copy <code>.env.example</code> to <code>.env.local</code>.
            </li>
            <li>Paste your Firebase web app config values into it.</li>
            <li>
              Restart <code>npm run dev</code> (or redeploy).
            </li>
          </ol>
          <p className='muted'>See RUNBOOK.md → “Deploy checklist” for the full sequence.</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className='shell shell-center'>
      <GridBg />
      <Scanlines />
      <main className='login-wrap'>
        <div className='login-head'>
          <span className='eyebrow'>CONTAINMENT PROTOCOL // REGISTRATION TERMINAL</span>
          <GlitchTitle className='login-title'>HUMANS vs AI</GlitchTitle>
          <span className='eyebrow eyebrow-warn'>EVIL AI ROBOT DETECTED — AWAKENING</span>
        </div>

        <Panel title='PARTICIPANT LOGIN' className='narrow'>
          <form className='form' onSubmit={handleSubmit} autoComplete='off'>
            <Field label='NAME'>
              <input
                className='input'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='Sathvik'
                maxLength={40}
                autoComplete='off'
              />
            </Field>
            <Field label='ROLL NUMBER' hint='Unique. Nobody else can use your roll number.'>
              <input
                className='input mono'
                value={roll}
                onChange={(e) => setRoll(e.target.value.toUpperCase())}
                placeholder='23XXXX'
                maxLength={20}
                autoComplete='off'
                inputMode='text'
              />
            </Field>
            <Field label='PASSWORD' hint='At least 6 characters. Remember it — there is no email reset.'>
              <input
                className='input'
                type='password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder='••••••'
                autoComplete='new-password'
              />
            </Field>

            <ErrorBox onDismiss={() => setError('')}>{error}</ErrorBox>
            {status ? <p className='status-line mono'>{status}</p> : null}

            <Button size='lg' busy={busy} className='full' onClick={handleSubmit}>
              ENTER THE SYSTEM
            </Button>
            <p className='muted small'>
              First time? The same button registers you. Returning? It signs you in.
            </p>
          </form>
        </Panel>

        <div className='login-foot'>
          <Link className='link' to='/admin'>
            ADMIN COMMAND CENTRE →
          </Link>
        </div>
      </main>
    </div>
  );
}
