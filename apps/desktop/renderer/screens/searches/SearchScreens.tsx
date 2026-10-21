// C7 register searches (old `Search year`, `Search Date`, `Search Datection date`) and the two
// look-ups on the reports menu (details by court + case number; CRs by name / NIC).
// Each asks for its few values, lists the CRs, and a row opens the CR view.
import type { CrListRow } from '@excise/contract';
import { label } from '@excise/labels';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  Actions,
  Button,
  DateField,
  FieldGrid,
  FormSection,
  Select,
  TextField,
} from '../../design-system/index.js';
import { call } from '../../src/ipc.js';
import { useRefOptions } from '../../src/references.js';
import { lastOffice } from '../shared/CrPicker.js';
import {
  CrResults,
  ErrorLine,
  OfficeSelect,
  PrintButtons,
  useOfficeYear,
  useRun,
} from '../shared/results.js';

function SearchForm({
  title,
  fields,
  canSearch,
  onSearch,
  busy,
  extra,
}: {
  title: string;
  fields: ReactNode;
  canSearch: boolean;
  onSearch: () => void;
  busy: boolean;
  extra?: ReactNode;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSearch) onSearch();
  };
  return (
    <>
      <h1>{title}</h1>
      <form onSubmit={submit} aria-label={title}>
        <FormSection title={label('search.go')}>
          <FieldGrid>{fields}</FieldGrid>
          <Actions>
            {extra}
            <Button type="submit" variant="primary" busy={busy} disabled={!canSearch}>
              {label('search.go')}
            </Button>
          </Actions>
        </FormSection>
      </form>
    </>
  );
}

export function RegisterByYearScreen() {
  const { officeId, year, fields } = useOfficeYear();
  const s = useRun<CrListRow[]>();
  return (
    <>
      <SearchForm
        title={label('menu.registerByYear')}
        fields={fields}
        canSearch={!!officeId && !!year}
        busy={s.busy}
        onSearch={() =>
          s.run(() =>
            call('search.crimeReports', { kind: 'year', officeId: officeId!, year: year! }),
          )
        }
        extra={
          <PrintButtons
            disabled={!officeId || !year}
            print={(target) =>
              call(
                'print.register',
                {
                  scope: { kind: 'year', officeId: officeId!, year: year! },
                  person: { kind: 'none' },
                  type: 'register',
                },
                target,
              )
            }
          />
        }
      />
      <ErrorLine error={s.error} />
      {s.result && <CrResults rows={s.result} />}
    </>
  );
}

function ByDateScreen({ kind, title }: { kind: 'court_date' | 'detection_date'; title: string }) {
  const [officeId, setOfficeId] = useState<string | undefined>(lastOffice());
  const [date, setDate] = useState<string | undefined>();
  const s = useRun<CrListRow[]>();
  return (
    <>
      <SearchForm
        title={title}
        fields={
          <>
            <OfficeSelect value={officeId} onChange={setOfficeId} />
            <DateField
              label={label(kind === 'court_date' ? 'case.courtDate' : 'cr.detectionDate')}
              value={date}
              onChange={setDate}
            />
          </>
        }
        canSearch={!!officeId && !!date}
        busy={s.busy}
        onSearch={() =>
          s.run(() => call('search.crimeReports', { kind, officeId: officeId!, date: date! }))
        }
      />
      <ErrorLine error={s.error} />
      {s.result && <CrResults rows={s.result} />}
    </>
  );
}

export const ByCourtDateScreen = () => (
  <ByDateScreen kind="court_date" title={label('menu.byCourtDate')} />
);
export const ByDetectionDateScreen = () => (
  <ByDateScreen kind="detection_date" title={label('menu.byDetectionDate')} />
);

/** නඩු අංකයකට අදාළ විස්තර: court + case number. */
export function CaseNumberScreen() {
  const courts = useRefOptions('court');
  const [courtId, setCourtId] = useState<string | undefined>();
  const [caseNumber, setCaseNumber] = useState('');
  const s = useRun<CrListRow[]>();
  return (
    <>
      <SearchForm
        title={label('reports.byCaseNumber')}
        fields={
          <>
            <Select
              label={label('case.court')}
              value={courtId}
              options={courts}
              onChange={setCourtId}
            />
            <TextField label={label('case.number')} value={caseNumber} onChange={setCaseNumber} />
          </>
        }
        canSearch={!!courtId && caseNumber.trim() !== ''}
        busy={s.busy}
        onSearch={() =>
          s.run(() =>
            call('search.crimeReports', { kind: 'court_case', courtId: courtId!, caseNumber }),
          )
        }
      />
      <ErrorLine error={s.error} />
      {s.result && <CrResults rows={s.result} />}
    </>
  );
}

/** නම හා හැදුනුම්පත් අංකය අනුව අපරාධ වාර්තා. */
export function NameNicScreen() {
  const [name, setName] = useState('');
  const [nic, setNic] = useState('');
  const s = useRun<CrListRow[]>();
  return (
    <>
      <SearchForm
        title={label('reports.byNameNic')}
        fields={
          <>
            <TextField label={label('search.name')} value={name} onChange={setName} />
            <TextField label={label('search.nic')} value={nic} onChange={setNic} />
          </>
        }
        canSearch={name.trim() !== '' || nic.trim() !== ''}
        busy={s.busy}
        onSearch={() =>
          s.run(() =>
            call('search.crimeReports', {
              kind: 'name_nic',
              ...(name.trim() ? { name } : {}),
              ...(nic.trim() ? { nic } : {}),
            }),
          )
        }
      />
      <ErrorLine error={s.error} />
      {s.result && <CrResults rows={s.result} />}
    </>
  );
}
