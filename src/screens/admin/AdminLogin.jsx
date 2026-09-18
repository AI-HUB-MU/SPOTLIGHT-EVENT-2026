import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../state/AuthContext.jsx';
import { Button, ErrorBox, Field, GlitchTitle, GridBg, Panel, Scanlines } from '../../components/ui.jsx';
import { CONFIG_MISSING } from '../../firebase/config.js';

/** Admin sign-in: a real Firebase Auth account listed in admins/{uid}. */
export default function AdminLogin() {
  const { loginAsAdmin, user, isAdmin, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    if (user && isAdmin === false) await logout();
    const result = await loginAsAdmin({ email, password });
    setBusy(false);
    if (!result.ok) setError(result.message);
  }

  return (
    <div className='shell shell-center'>
      <GridBg />
      <Scanlines />
      <main className='login-wrap'>
        <div className='login-head'>
          <span className='eyebrow eyebrow-warn'>RESTRICTED // OVERRIDE AUTHORITY REQUIRED</span>
          <GlitchTitle className='login-title'>COMMAND CENTRE</GlitchTitle>
          {user && isAdmin === false ? (
            <span className='eyebrow'>A PARTICIPANT SESSION IS ACTIVE — IT WILL BE CLOSED</span>
          ) : null}
        </div>

        {CONFIG_MISSING ? (
          <Panel title='SYSTEM NOT CONFIGURED' tone='danger' className='narrow'>
            <p>
              Add your Firebase keys to <code>.env.local</code> first (see RUNBOOK.md).
            </p>
          </Panel>
        ) : (
          <Panel title='ADMIN AUTHENTICATION' className='narrow'>
            <form className='form' onSubmit={submit}>
              <Field label='ADMIN EMAIL'>
                <input
                  className='input'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder='you@college.edu'
                  autoComplete='username'
                />
              </Field>
              <Field label='PASSWORD'>
                <input
                  className='input'
                  type='password'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete='current-password'
                />
              </Field>
              <ErrorBox onDismiss={() => setError('')}>{error}</ErrorBox>
              <Button size='lg' className='full' busy={busy} onClick={submit}>
                ENTER COMMAND CENTRE
              </Button>
            </form>
          </Panel>
        )}

        <div className='login-foot'>
          <Link className='link' to='/'>
            ← PARTICIPANT TERMINAL
          </Link>
        </div>
      </main>
    </div>
  );
}
