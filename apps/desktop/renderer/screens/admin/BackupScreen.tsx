// Backup and restore (A8, OIC only): choose the backup folder (USB or share), daily automatic
// backups and how many to keep, back up now, check a backup, restore one (the app saves a copy
// of the current data first and restarts afterwards).
import type { BackupInfo, BackupSettings } from '@excise/contract';
import { label } from '@excise/labels';
import { useEffect, useState } from 'react';
import {
  Actions,
  Alert,
  Button,
  Checkbox,
  ConfirmDialog,
  FieldGrid,
  FormSection,
  NumberField,
  Table,
  formatDate,
  useToast,
} from '../../design-system/index.js';
import { call, IpcError } from '../../src/ipc.js';
import { ErrorLine } from '../shared/results.js';
import './admin.css';

const size = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
const when = (iso: string | null) => (iso ? `${formatDate(iso)} ${iso.slice(11, 16)}` : '—');

export function BackupScreen() {
  const toast = useToast();
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<{ name: string; ok: boolean; detail: string } | null>(null);
  const [restore, setRestore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setSettings(await call('backup.settings'));
    setBackups(await call('backup.list'));
  };
  const act = (fn: () => Promise<unknown>) => async () => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof IpcError ? e.caption : label('error.unknown'));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void act(async () => undefined)();
  }, []);

  return (
    <>
      <h1>{label('admin.backup')}</h1>
      <ErrorLine error={error} />
      {settings && (
        <FormSection title={label('backup.folder')}>
          {settings.folder ? (
            <p className="backup__folder">{settings.folder}</p>
          ) : (
            <Alert kind="warn">{label('backup.noFolder')}</Alert>
          )}
          <FieldGrid>
            <NumberField
              label={label('backup.keep')}
              value={settings.keep}
              onChange={(keep) => keep && void act(() => call('backup.updateSettings', { keep }))()}
            />
            <Checkbox
              label={label('backup.daily')}
              checked={settings.dailyEnabled}
              onChange={(dailyEnabled) =>
                void act(() => call('backup.updateSettings', { dailyEnabled }))()
              }
            />
          </FieldGrid>
          <p className="ex-muted">
            {label('backup.last')}: {when(settings.lastBackupAt)}
          </p>
          <Actions>
            <Button onClick={act(() => call('backup.chooseFolder'))}>
              {label('backup.chooseFolder')}
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!settings.folder}
              onClick={act(async () => {
                const b = await call('backup.now');
                toast(`${label('backup.done')} ${b.name}`);
              })}
            >
              {label('backup.now')}
            </Button>
          </Actions>
        </FormSection>
      )}
      <FormSection title={label('backup.list')}>
        {check && (
          <Alert kind={check.ok ? 'ok' : 'error'}>
            {check.name}: {check.ok ? label('backup.ok') : `${label('backup.bad')} ${check.detail}`}
          </Alert>
        )}
        <Table
          caption={label('backup.list')}
          rows={backups}
          rowKey={(b) => b.name}
          columns={[
            {
              key: 'createdAt',
              title: label('audit.when'),
              value: (b) => b.createdAt,
              render: (b) => when(b.createdAt),
            },
            {
              key: 'kind',
              title: label('audit.action'),
              value: (b) => label(`backup.kind.${b.kind}`),
            },
            {
              key: 'size',
              title: label('backup.size'),
              value: (b) => b.sizeBytes,
              render: (b) => size(b.sizeBytes),
              numeric: true,
            },
            {
              key: 'actions',
              title: '',
              value: () => null,
              render: (b) => (
                <span className="ex-check">
                  <Button
                    variant="ghost"
                    onClick={act(async () =>
                      setCheck({ name: b.name, ...(await call('backup.verify', b.name)) }),
                    )}
                  >
                    {label('backup.verify')}
                  </Button>
                  <Button variant="ghost" onClick={() => setRestore(b.name)}>
                    {label('backup.restore')}
                  </Button>
                </span>
              ),
            },
          ]}
        />
        <Actions>
          <Button onClick={act(() => call('backup.restoreFromFolder'))}>
            {label('backup.restoreFromFolder')}
          </Button>
        </Actions>
      </FormSection>
      <ConfirmDialog
        open={!!restore}
        title={label('backup.restore')}
        message={label('backup.confirmRestore')}
        danger
        confirmLabel={label('backup.restore')}
        onCancel={() => setRestore(null)}
        onConfirm={() => {
          const name = restore!;
          setRestore(null);
          void act(() => call('backup.restore', name))();
        }}
      />
    </>
  );
}
