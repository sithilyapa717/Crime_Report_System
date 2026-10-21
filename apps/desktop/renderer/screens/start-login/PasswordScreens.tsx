// First-run set-up (the station head creates the first account; there is no default password)
// and the change-password screen (forced after an OIC creates or resets an account).
import type { Session } from '@excise/contract';
import { label } from '@excise/labels';
import { useState, type FormEvent } from 'react';
import { Actions, Alert, Button, PasswordField, TextField } from '../../design-system/index.js';
import { call, IpcError } from '../../src/ipc.js';
import { AuthLayout } from './AuthLayout.js';

const MIN = 8;

function passwordProblem(password: string, again: string): string | undefined {
  if (password && password.length < MIN) return label('error.too_short');
  if (again && password !== again) return label('error.mismatch');
  return undefined;
}

export function FirstRunScreen({ onDone }: { onDone: (s: Session) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = passwordProblem(password, again);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await call('auth.createFirstUser', username, password));
    } catch (err) {
      setError(err instanceof IpcError ? err.caption : label('error.unknown'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth__heading">
        <h1>{label('admin.firstRun')}</h1>
        <p className="auth__sub">{label('setup.intro')}</p>
      </div>
      <form onSubmit={submit} noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        <TextField
          label={label('login.username')}
          value={username}
          onChange={setUsername}
          autoFocus
        />
        <PasswordField
          label={label('password.new')}
          value={password}
          onChange={setPassword}
          error={password ? problem : undefined}
        />
        <PasswordField label={label('password.confirm')} value={again} onChange={setAgain} />
        <Actions>
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            disabled={!username || !password || password !== again || !!problem}
          >
            {label('setup.submit')}
          </Button>
        </Actions>
      </form>
    </AuthLayout>
  );
}

export function ChangePasswordScreen({
  forced,
  onDone,
  onCancel,
}: {
  forced: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [old, setOld] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = passwordProblem(password, again);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call('auth.changePassword', old, password);
      onDone();
    } catch (err) {
      setError(err instanceof IpcError ? err.caption : label('error.unknown'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth__heading">
        <h1>{label('admin.changePassword')}</h1>
      </div>
      {forced && <Alert kind="warn">{label('password.mustChange')}</Alert>}
      <form onSubmit={submit} noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        <PasswordField label={label('password.old')} value={old} onChange={setOld} autoFocus />
        <PasswordField
          label={label('password.new')}
          value={password}
          onChange={setPassword}
          error={password ? problem : undefined}
        />
        <PasswordField label={label('password.confirm')} value={again} onChange={setAgain} />
        <Actions>
          {onCancel && <Button onClick={onCancel}>{label('common.cancel')}</Button>}
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            disabled={!old || !password || password !== again || !!problem}
          >
            {label('common.save')}
          </Button>
        </Actions>
      </form>
    </AuthLayout>
  );
}
