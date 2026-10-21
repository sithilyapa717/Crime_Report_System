// "Choose the CR": office + CR number `n/year` → OK, as on the old forms (§1.4 header controls).
// Remembers the last office used on this PC.
import type { CrimeReport } from '@excise/schemas';
import { label } from '@excise/labels';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Button, FieldGrid, NumberField, Select } from '../../design-system/index.js';
import { call, IpcError } from '../../src/ipc.js';
import { useRefOptions } from '../../src/references.js';

const LAST_OFFICE = 'excise.lastOffice';

export function rememberOffice(id: string | undefined): void {
  try {
    if (id) localStorage.setItem(LAST_OFFICE, id);
  } catch {
    // storage not available: nothing to remember
  }
}

export function lastOffice(): string | undefined {
  try {
    return localStorage.getItem(LAST_OFFICE) ?? undefined;
  } catch {
    return undefined;
  }
}

export function CrPicker({
  onFound,
  extra,
  inline,
}: {
  onFound: (cr: CrimeReport) => void;
  extra?: ReactNode;
  /** One row of fields with the Open button beside them (Figma CR entry header). */
  inline?: boolean;
}) {
  const offices = useRefOptions('office');
  const [officeId, setOfficeId] = useState<string | undefined>(lastOffice());
  const [year, setYear] = useState<number | undefined>(new Date().getFullYear());
  const [seq, setSeq] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!officeId && offices.length === 1) setOfficeId(offices[0]!.value);
  }, [offices, officeId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!officeId || !year || !seq) return;
    setBusy(true);
    setError(null);
    try {
      const cr = await call('cr.find', officeId, year, `${seq}/${year}`);
      if (!cr) setError(label('cr.notFound'));
      else {
        rememberOffice(officeId);
        onFound(cr);
      }
    } catch (err) {
      setError(err instanceof IpcError ? err.caption : label('error.unknown'));
    } finally {
      setBusy(false);
    }
  };

  const fields = (
    <>
      <Select
        label={label('cr.office')}
        value={officeId}
        onChange={setOfficeId}
        options={offices}
      />
      <NumberField label={label('cr.year')} value={year} onChange={setYear} />
      <NumberField
        label={label('cr.number')}
        value={seq}
        onChange={setSeq}
        hint={!inline && year ? `n/${year}` : undefined}
      />
    </>
  );
  const open = (
    <Button
      type="submit"
      variant={inline ? 'default' : 'primary'}
      busy={busy}
      disabled={!officeId || !year || !seq}
    >
      {label('cr.find')}
    </Button>
  );

  if (inline)
    return (
      <form
        onSubmit={submit}
        className="cr-picker cr-picker--inline"
        aria-label={label('cr.openExisting')}
      >
        {error && <Alert kind="error">{error}</Alert>}
        <div className="ex-filters">
          {fields}
          {extra}
          {open}
        </div>
      </form>
    );

  return (
    <form onSubmit={submit} className="ex-card cr-picker" aria-label={label('cr.openExisting')}>
      <h2 className="cr-picker__title">{label('cr.openExisting')}</h2>
      {error && <Alert kind="error">{error}</Alert>}
      <FieldGrid>{fields}</FieldGrid>
      <div className="ex-actions">
        {extra}
        {open}
      </div>
    </form>
  );
}

/** The "find a CR" strip at the top of CR entry, CR view and case progress (Figma "Find CR"):
 *  the picker on the left, the screen's own buttons or summary on the right. */
export function FindBar({
  onFound,
  children,
}: {
  onFound: (cr: CrimeReport) => void;
  children?: ReactNode;
}) {
  return (
    <div className="find-bar">
      <CrPicker inline onFound={onFound} />
      {children && <div className="find-bar__end">{children}</div>}
    </div>
  );
}
