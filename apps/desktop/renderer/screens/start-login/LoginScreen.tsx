// Login with a personal user name and password (B2). The role card chosen on the sign-in screen
// must match the account's role, as the old per-role password forms did.
import type { Session } from '@excise/contract';
import { label } from '@excise/labels';
import type { Role } from '@excise/schemas';
import { useState, type FormEvent } from 'react';
import { Alert, Button, PasswordField, TextField } from '../../design-system/index.js';
import { call, IpcError } from '../../src/ipc.js';

export function LoginForm({ role, onLoggedIn }: { role: Role; onLoggedIn: (s: Session) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await call('auth.login', username, password);
      if (session.role !== role) {
        await call('auth.logout');
        setError(`${label('login.wrongRole')} ${label(`role.${session.role}`)}`);
        return;
      }
      onLoggedIn(session);
    } catch (err) {
      setError(err instanceof IpcError ? err.caption : label('error.unknown'));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="auth__heading">
        <h1>{label(`role.${role}`)}</h1>
        <p className="auth__sub">{label('login.subtitle')}</p>
        <span className="auth__chip">{label(`access.${role}`)}</span>
      </div>
      <form onSubmit={submit} noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        <TextField
          label={label('login.username')}
          value={username}
          onChange={setUsername}
          autoFocus
          autoComplete="username"
        />
        <PasswordField label={label('login.password')} value={password} onChange={setPassword} />
        <Button
          type="submit"
          variant="primary"
          className="auth__submit"
          busy={busy}
          disabled={!username || !password}
        >
          {label('login.submit')}
        </Button>
      </form>
      <p className="auth__note">{label('login.forgot')}</p>
    </>
  );
}
