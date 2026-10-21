// Change history (A10, OIC only): who changed what and when, filtered by date, user and record
// type; a row shows the fields whose values changed (old → new).
import type { AuditRecord, UserSummary } from '@excise/contract';
import { label } from '@excise/labels';
import type { AuditTable } from '@excise/schemas';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Actions,
  Button,
  DateField,
  FieldGrid,
  FormSection,
  Select,
  Table,
  formatDate,
} from '../../design-system/index.js';
import { call } from '../../src/ipc.js';
import { ErrorLine, useRun } from '../shared/results.js';

const TABLES: AuditTable[] = [
  'crime_reports',
  'cases',
  'users',
  'reference_items',
  'files',
  'backups',
  'documents',
];

/** Flattened field paths whose values differ between two JSON values. */
export function changedFields(
  before: unknown,
  after: unknown,
  prefix = '',
): { field: string; old: string; new: string }[] {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  if (isObj(before) || isObj(after)) {
    const b = isObj(before) ? before : {};
    const a = isObj(after) ? after : {};
    return [...new Set([...Object.keys(b), ...Object.keys(a)])]
      .filter((k) => !['updatedAt', 'version', 'createdAt'].includes(k))
      .flatMap((k) => changedFields(b[k], a[k], prefix ? `${prefix}.${k}` : k));
  }
  const s = (v: unknown) =>
    v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  return s(before) === s(after) ? [] : [{ field: prefix || '·', old: s(before), new: s(after) }];
}

export function AuditScreen() {
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [userId, setUserId] = useState<string | undefined>();
  const [table, setTable] = useState<string | undefined>();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [open, setOpen] = useState<AuditRecord | null>(null);
  const s = useRun<AuditRecord[]>();

  useEffect(() => {
    call('users.list')
      .then(setUsers)
      .catch(() => undefined);
  }, []);

  const search = (e?: FormEvent) => {
    e?.preventDefault();
    setOpen(null);
    void s.run(() =>
      call('audit.search', {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(userId ? { userId } : {}),
        ...(table ? { table: table as AuditTable } : {}),
        limit: 500,
      }),
    );
  };
  useEffect(() => search(), []);

  return (
    <>
      <h1>{label('admin.audit')}</h1>
      <form onSubmit={search} aria-label={label('admin.audit')}>
        <FormSection title={label('search.go')}>
          <FieldGrid>
            <DateField label={label('audit.from')} value={from} onChange={setFrom} />
            <DateField label={label('audit.to')} value={to} onChange={setTo} />
            <Select
              label={label('audit.user')}
              value={userId}
              onChange={setUserId}
              options={users.map((u) => ({ value: u.id, label: u.username }))}
            />
            <Select
              label={label('audit.table')}
              value={table}
              onChange={setTable}
              options={TABLES.map((t) => ({ value: t, label: label(`audit.table.${t}`) }))}
            />
          </FieldGrid>
          <Actions>
            <Button type="submit" variant="primary" busy={s.busy}>
              {label('search.go')}
            </Button>
          </Actions>
        </FormSection>
      </form>
      <ErrorLine error={s.error} />
      {s.result && (
        <Table
          caption={label('admin.audit')}
          rows={s.result}
          rowKey={(r) => r.id}
          onRowClick={setOpen}
          columns={[
            {
              key: 'at',
              title: label('audit.when'),
              value: (r) => r.at,
              render: (r) => `${formatDate(r.at)} ${r.at.slice(11, 19)}`,
            },
            { key: 'user', title: label('audit.user'), value: (r) => r.username ?? '—' },
            { key: 'action', title: label('audit.action'), value: (r) => r.action },
            {
              key: 'table',
              title: label('audit.table'),
              value: (r) => label(`audit.table.${r.table}`),
            },
            {
              key: 'row',
              title: label('audit.row'),
              value: (r) => (r.rowId ? r.rowId.slice(0, 8) : ''),
            },
          ]}
        />
      )}
      {open && (
        <FormSection title={`${label('audit.changes')}: ${open.action} · ${formatDate(open.at)}`}>
          <Table
            rows={changedFields(open.before, open.after)}
            rowKey={(c) => c.field}
            columns={[
              { key: 'field', title: label('audit.field'), value: (c) => c.field },
              { key: 'old', title: label('audit.old'), value: (c) => c.old },
              { key: 'new', title: label('audit.new'), value: (c) => c.new },
            ]}
          />
        </FormSection>
      )}
    </>
  );
}
