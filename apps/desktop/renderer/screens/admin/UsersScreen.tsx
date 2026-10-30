// Users (OIC only): add users with a temporary password, deactivate, unlock, reset a password.
// The station head cannot deactivate their own account (the service refuses it too).
import type { UserSummary } from '@excise/contract';
import { label } from '@excise/labels';
import type { Role } from '@excise/schemas';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Card,
  Actions,
  Badge,
  Button,
  Dialog,
  FormSection,
  PasswordField,
  Select,
  Table,
  TextField,
  useToast,
} from '../../design-system/index.js';
import { useNav } from '../../shell/navigation.js';
import { call, IpcError } from '../../src/ipc.js';
import { ErrorLine } from '../shared/results.js';
import './admin.css';

const ROLES: Role[] = ['oic', 'detecting', 'observation', 'supervising'];

export function UsersScreen() {
  const { session } = useNav();
  const toast = useToast();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<string | undefined>('detecting');
  const [password, setPassword] = useState('');
  const [resetFor, setResetFor] = useState<UserSummary | null>(null);
  const [temp, setTemp] = useState('');

  const refresh = () =>
    call('users.list')
      .then(setUsers)
      .catch((e: unknown) => setError(e instanceof IpcError ? e.caption : label('error.unknown')));
  useEffect(() => {
    void refresh();
  }, []);

  const act = (fn: () => Promise<unknown>, done?: string) => async () => {
    setError(null);
    try {
      await fn();
      if (done) toast(done);
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof IpcError ? e.caption : label('error.unknown'));
      return false;
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await act(
      () => call('auth.createUser', username, password, role as Role),
      label('users.created'),
    )();
    if (ok) {
      setUsername('');
      setPassword('');
    }
  };

  return (
    <>
      <h1>{label('admin.users')}</h1>
      <ErrorLine error={error} />
      <Card>
        <Table
          caption={label('admin.users')}
          rows={users}
          rowKey={(u) => u.id}
          columns={[
            { key: 'username', title: label('login.username'), value: (u) => u.username },
            { key: 'role', title: label('users.role'), value: (u) => label(`role.${u.role}`) },
            {
              key: 'state',
              title: '',
              value: (u) => `${u.active}${u.locked}${u.mustChangePassword}`,
              render: (u) => (
                <>
                  {!u.active && <Badge kind="danger">{label('users.deactivate')}</Badge>}{' '}
                  {u.locked && <Badge kind="warn">{label('users.locked')}</Badge>}{' '}
                  {u.mustChangePassword && <Badge>{label('users.mustChange')}</Badge>}
                </>
              ),
            },
            {
              key: 'actions',
              title: '',
              value: () => null,
              render: (u) => (
                <span className="ex-check">
                  {u.id !== session.userId && (
                    <Button
                      variant={u.active ? 'warn' : 'ok'}
                      onClick={act(() => call('users.setActive', u.id, !u.active))}
                    >
                      {label(u.active ? 'users.deactivate' : 'users.activate')}
                    </Button>
                  )}
                  {u.locked && (
                    <Button variant="ok" onClick={act(() => call('auth.unlockUser', u.id))}>
                      {label('users.unlock')}
                    </Button>
                  )}
                  <Button
                    variant="edit"
                    onClick={() => {
                      setTemp('');
                      setResetFor(u);
                    }}
                  >
                    {label('users.reset')}
                  </Button>
                </span>
              ),
            },
          ]}
        />
      </Card>
      <form onSubmit={add} aria-label={label('users.add')}>
        <FormSection title={label('users.add')}>
          <div className="ex-filters users-add">
            <TextField label={label('login.username')} value={username} onChange={setUsername} />
            <Select
              label={label('users.role')}
              value={role}
              onChange={setRole}
              options={ROLES.map((r) => ({ value: r, label: label(`role.${r}`) }))}
            />
            <PasswordField
              label={label('users.tempPassword')}
              value={password}
              onChange={setPassword}
            />
            <Button type="submit" variant="primary" disabled={!username || !password || !role}>
              {label('users.add')}
            </Button>
          </div>
        </FormSection>
      </form>
      <Dialog
        open={!!resetFor}
        onClose={() => setResetFor(null)}
        title={`${label('users.reset')}: ${resetFor?.username ?? ''}`}
      >
        <PasswordField label={label('users.tempPassword')} value={temp} onChange={setTemp} />
        <Actions>
          <Button onClick={() => setResetFor(null)}>{label('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={temp.length === 0}
            onClick={async () => {
              const ok = await act(
                () => call('users.resetPassword', resetFor!.id, temp),
                label('users.resetDone'),
              )();
              if (ok) setResetFor(null);
            }}
          >
            {label('users.reset')}
          </Button>
        </Actions>
      </Dialog>
    </>
  );
}
