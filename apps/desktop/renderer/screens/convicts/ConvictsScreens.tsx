// C8: the convicts register (old `Query seach volum`, printed list "වරදකරුවන්ගේ ලේඛනය") and the
// convicts check by name / NIC (old `Search name`, `Search id no`). Figma layout: the filters in
// one card with the search button beside them, the results card with the print buttons below.
import type { ConvictRow } from '@excise/contract';
import { label } from '@excise/labels';
import { useState, type FormEvent } from 'react';
import { Button, Card, Select, TextField } from '../../design-system/index.js';
import { call } from '../../src/ipc.js';
import {
  ConvictResults,
  ErrorLine,
  MONTH_OPTIONS,
  PrintButtons,
  useOfficeYear,
  useRun,
} from '../shared/results.js';

export function ConvictsRegisterScreen() {
  const { officeId, year, fields } = useOfficeYear();
  const [month, setMonth] = useState<string | undefined>();
  const s = useRun<ConvictRow[]>();
  const filter = () => ({
    ...(officeId ? { officeId } : {}),
    ...(year ? { year } : {}),
    ...(month ? { month: Number(month) } : {}),
  });
  const search = (e: FormEvent) => {
    e.preventDefault();
    void s.run(() => call('search.convicts', filter()));
  };
  return (
    <>
      <Card>
        <form className="ex-filters" onSubmit={search} aria-label={label('menu.convicts')}>
          {fields}
          <Select
            label={label('search.monthOptional')}
            value={month}
            options={MONTH_OPTIONS}
            onChange={setMonth}
          />
          <Button type="submit" variant="primary" busy={s.busy} disabled={!officeId || !year}>
            {label('menu.convicts')}
          </Button>
        </form>
      </Card>
      <ErrorLine error={s.error} />
      {s.result && (
        <ConvictResults
          rows={s.result}
          actions={
            <PrintButtons
              disabled={!year}
              print={(target) => call('print.convictsList', filter(), target)}
            />
          }
        />
      )}
    </>
  );
}

export function ConvictsCheckScreen() {
  const [name, setName] = useState('');
  const [nic, setNic] = useState('');
  const s = useRun<ConvictRow[]>();
  const search = (e: FormEvent) => {
    e.preventDefault();
    void s.run(() =>
      call('search.convicts', { ...(name.trim() ? { name } : {}), ...(nic.trim() ? { nic } : {}) }),
    );
  };
  return (
    <>
      <Card>
        <form className="ex-filters" onSubmit={search} aria-label={label('menu.convictsCheck')}>
          <TextField label={label('search.name')} value={name} onChange={setName} />
          <TextField label={label('search.nic')} value={nic} onChange={setNic} />
          <Button
            type="submit"
            variant="primary"
            busy={s.busy}
            disabled={!name.trim() && !nic.trim()}
          >
            {label('menu.convictsCheck')}
          </Button>
        </form>
      </Card>
      <ErrorLine error={s.error} />
      {s.result && <ConvictResults rows={s.result} />}
    </>
  );
}
