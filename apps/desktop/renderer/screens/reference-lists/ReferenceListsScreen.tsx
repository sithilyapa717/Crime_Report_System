// A11: the 14 lookup lists of the old `menu form4`, one tab each with the old Sinhala titles.
// Add, rename (records keep the id, so the new name shows everywhere), activate / deactivate,
// delete only when no CR uses the item. Offences have a code; officers may have a rank.
// The add row sits above the list, so it stays in the same place whichever list is open and
// however long it is; after adding, the name box is ready for the next item.
import type { ReferenceItem } from '@excise/contract';
import { label, REFERENCE_KIND_LABEL } from '@excise/labels';
import { OFFICER_KINDS, type ReferenceKind } from '@excise/schemas';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Actions,
  Badge,
  Button,
  ConfirmDialog,
  Card,
  Dialog,
  Table,
  Tabs,
  TextField,
  useToast,
} from '../../design-system/index.js';
import { call, IpcError } from '../../src/ipc.js';
import { useSaveFailure } from '../../src/save-failure.js';
import { forgetLists } from '../../src/references.js';
import { ErrorLine } from '../shared/results.js';
import './reference-lists.css';

const KINDS = Object.keys(REFERENCE_KIND_LABEL) as ReferenceKind[];
const isOfficer = (k: ReferenceKind) => (OFFICER_KINDS as readonly string[]).includes(k);

export function ReferenceListsScreen() {
  const [kind, setKind] = useState<ReferenceKind>('office');
  return (
    <>
      <h1>{label('menu.referenceLists')}</h1>
      <Tabs
        label={label('menu.referenceLists')}
        active={kind}
        onChange={(k) => setKind(k as ReferenceKind)}
        tabs={KINDS.map((k) => ({
          key: k,
          title: label(REFERENCE_KIND_LABEL[k]),
          content: k === kind ? <ListEditor kind={k} /> : null,
        }))}
      />
    </>
  );
}

function ListEditor({ kind }: { kind: ReferenceKind }) {
  const [items, setItems] = useState<ReferenceItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [rank, setRank] = useState('');
  const [editing, setEditing] = useState<ReferenceItem | null>(null);
  const [deleting, setDeleting] = useState<ReferenceItem | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const saveFailure = useSaveFailure();
  const toast = useToast();
  const addForm = useRef<HTMLFormElement>(null);

  const refresh = () =>
    call('reference.list', kind, { includeInactive: true })
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof IpcError ? e.caption : label('error.unknown')));
  useEffect(() => {
    void refresh();
  }, [kind]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      forgetLists();
      await refresh();
      return true;
    } catch (e) {
      if (!saveFailure.report(e))
        setError(e instanceof IpcError ? e.caption : label('error.unknown'));
      return false;
    }
  };
  const input = (v: string, c: string, r: string) => ({
    value: v,
    ...(kind === 'offence' && c.trim() ? { code: c } : {}),
    ...(isOfficer(kind) && r.trim() ? { rank: r } : {}),
  });

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const added = value.trim();
    if (await act(() => call('reference.add', kind, input(value, code, rank)))) {
      setValue('');
      setCode('');
      setRank('');
      toast(`${label('lists.added')}: ${added}`);
      addForm.current?.querySelector('input')?.focus();
    }
  };

  return (
    <>
      <Card title={label('lists.add')}>
        <form
          ref={addForm}
          onSubmit={add}
          className="ex-filters ref-add"
          aria-label={`${label('lists.add')}: ${label(REFERENCE_KIND_LABEL[kind])}`}
        >
          {kind === 'offence' && (
            <TextField label={label('lists.code')} value={code} onChange={setCode} />
          )}
          {isOfficer(kind) && (
            <TextField label={label('lists.rank')} value={rank} onChange={setRank} />
          )}
          <TextField label={label('lists.value')} value={value} onChange={setValue} />
          <Button
            type="submit"
            variant="primary"
            disabled={!value.trim() || (kind === 'offence' && !code.trim())}
          >
            {label('lists.add')}
          </Button>
        </form>
      </Card>
      <ErrorLine error={error} />
      <Table
        caption={label(REFERENCE_KIND_LABEL[kind])}
        rows={items}
        rowKey={(i) => i.id}
        filterable={items.length > 15}
        columns={[
          ...(kind === 'offence'
            ? [{ key: 'code', title: label('lists.code'), value: (i: ReferenceItem) => i.code }]
            : []),
          {
            key: 'value',
            title: label('lists.value'),
            value: (i) => i.value,
            render: (i) => (
              <>
                {i.rank ? `${i.rank} ` : ''}
                {i.value} {!i.active && <Badge kind="warn">{label('lists.inactive')}</Badge>}
                {usage[i.id] !== undefined && (
                  <span className="ex-muted">
                    {' '}
                    · {label('lists.used')} {usage[i.id]}
                  </span>
                )}
              </>
            ),
          },
          {
            key: 'actions',
            title: '',
            value: () => null,
            render: (i) => (
              <span className="ex-check">
                <Button variant="ghost" onClick={() => setEditing(i)}>
                  {label('lists.rename')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void act(() => call('reference.setActive', i.id, !i.active))}
                >
                  {label(i.active ? 'users.deactivate' : 'users.activate')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const n = await call('reference.usageCount', i.id).catch(() => undefined);
                    if (n !== undefined) setUsage((u) => ({ ...u, [i.id]: n }));
                    setDeleting(i);
                  }}
                >
                  {label('lists.delete')}
                </Button>
              </span>
            ),
          },
        ]}
      />
      {editing && (
        <RenameDialog
          item={editing}
          kind={kind}
          onClose={() => setEditing(null)}
          onSave={(v, c, r) => act(() => call('reference.rename', editing.id, input(v, c, r)))}
        />
      )}
      {saveFailure.dialog}
      <ConfirmDialog
        open={!!deleting}
        title={label('lists.delete')}
        message={`${deleting?.value ?? ''}: ${label('lists.confirmDelete')} ${deleting && usage[deleting.id] ? `(${label('lists.used')} ${usage[deleting.id]})` : ''}`}
        danger
        confirmLabel={label('lists.delete')}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const id = deleting!.id;
          setDeleting(null);
          void act(() => call('reference.remove', id));
        }}
      />
    </>
  );
}

function RenameDialog({
  item,
  kind,
  onClose,
  onSave,
}: {
  item: ReferenceItem;
  kind: ReferenceKind;
  onClose: () => void;
  onSave: (value: string, code: string, rank: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(item.value);
  const [code, setCode] = useState(item.code ?? '');
  const [rank, setRank] = useState(item.rank ?? '');
  return (
    <Dialog open onClose={onClose} title={label('lists.rename')}>
      {kind === 'offence' && (
        <TextField label={label('lists.code')} value={code} onChange={setCode} />
      )}
      {isOfficer(kind) && <TextField label={label('lists.rank')} value={rank} onChange={setRank} />}
      <TextField label={label('lists.value')} value={value} onChange={setValue} />
      <Actions>
        <Button onClick={onClose}>{label('common.cancel')}</Button>
        <Button
          variant="primary"
          disabled={!value.trim()}
          onClick={async () => {
            if (await onSave(value, code, rank)) onClose();
          }}
        >
          {label('common.save')}
        </Button>
      </Actions>
    </Dialog>
  );
}
