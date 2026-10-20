// Login with a personal user name and password (B2). The role button chosen on the start screen
// must match the account's role, as the old per-role password forms did.
import type { Session } from '@excise/contract';
import { label } from '@excise/labels';
import type { Role } from '@excise/schemas';
import { useState, type FormEvent } from 'react';
import { Actions, Alert, Button, PasswordField, TextField } from '../../design-system/index.js';
import { call, IpcError } from '../../src/ipc.js';

export function LoginScreen({
  role,
  onBack,
  onLoggedIn,
}: {
  role: Role;
  onBack: () => void;
  onLoggedIn: (s: Session) => void;
}) {
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
    <div className="ex-narrow ex-card">
      <h1>{label(`role.${role}`)}</h1>
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
        <Actions>
          <Button onClick={onBack}>{label('login.back')}</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!username || !password}>
            {label('login.submit')}
          </Button>
        </Actions>
      </form>
    </div>
  );
}
