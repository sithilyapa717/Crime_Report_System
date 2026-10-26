// Pieces every search and report screen uses: the CR result table (click a row → CR view), the
// convicts table, print / PDF buttons, and running a call with its error shown.
import type { ConvictRow, CrListRow } from '@excise/contract';
import { label } from '@excise/labels';
import { useState, type ReactNode } from 'react';
import {
  Actions,
  Alert,
  Button,
  Card,
  NumberField,
  Select,
  Table,
  formatDate,
  formatMoney,
  useToast,
  type Column,
} from '../../design-system/index.js';
import { useNav } from '../../shell/navigation.js';
import { IpcError } from '../../src/ipc.js';
import { useRefOptions } from '../../src/references.js';
import { lastOffice, rememberOffice } from './CrPicker.js';

/** Runs a service call, keeping its result, busy flag and (Sinhala) error message. */
export function useRun<T>() {
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await fn());
    } catch (e) {
      setResult(null);
      setError(e instanceof IpcError ? e.caption : label('error.unknown'));
    } finally {
      setBusy(false);
    }
  };
  return { result, error, busy, run, setResult };
}

export function ErrorLine({ error }: { error: string | null }) {
  return error ? <Alert kind="error">{error}</Alert> : null;
}

/** Office drop-down that remembers the last office used on this PC. */
export function OfficeSelect({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v?: string) => void;
}) {
  const offices = useRefOptions('office');
  return (
    <Select
      label={label('cr.office')}
      value={value}
      options={offices}
      onChange={(v) => {
        rememberOffice(v);
        onChange(v);
      }}
    />
  );
}

export function useOfficeYear() {
  const [officeId, setOfficeId] = useState<string | undefined>(lastOffice());
  const [year, setYear] = useState<number | undefined>(new Date().getFullYear());
  return {
    officeId,
    year,
    fields: (
      <>
        <OfficeSelect value={officeId} onChange={setOfficeId} />
        <NumberField label={label('cr.year')} value={year} onChange={setYear} />
      </>
    ),
  };
}

export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: label(`month.${i + 1}`),
}));

const c = (key: string) => label(`report.col.${key}`);

/** Figma results card: the table, then "ප්‍රතිඵල N" on the left and the buttons on the right. */
export function ResultsCard({
  count,
  countText = `${label('search.results')} ${count}`,
  title,
  actions,
  children,
}: {
  count: number;
  countText?: string;
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card title={title}>
      {children}
      <div className="ex-results-foot">
        <span className="ex-results-foot__count" role="status">
          {countText}
        </span>
        {actions && <Actions>{actions}</Actions>}
      </div>
    </Card>
  );
}

export function CrResults({
  rows,
  actions,
  onOpen,
}: {
  rows: CrListRow[];
  actions?: ReactNode;
  /** What a row click does; the CR view by default. */
  onOpen?: (row: CrListRow) => void;
}) {
  const { go } = useNav();
  const columns: Column<CrListRow>[] = [
    { key: 'crNumber', title: c('crNumber'), value: (r) => r.crNumber },
    { key: 'officeName', title: c('officeName'), value: (r) => r.officeName },
    {
      key: 'detectionDate',
      title: c('detectionDate'),
      value: (r) => r.detectionDate,
      render: (r) => formatDate(r.detectionDate),
    },
    { key: 'offenceCode', title: c('offenceCode'), value: (r) => r.offenceCode },
    { key: 'accusedName', title: c('accusedName'), value: (r) => r.accusedName },
    { key: 'accusedNic', title: c('accusedNic'), value: (r) => r.accusedNic },
    { key: 'courtName', title: c('courtName'), value: (r) => r.courtName },
    {
      key: 'courtDate',
      title: c('courtDate'),
      value: (r) => r.courtDate,
      render: (r) => formatDate(r.courtDate),
    },
    { key: 'caseNumber', title: c('caseNumber'), value: (r) => r.caseNumber },
  ];
  return (
    <ResultsCard count={rows.length} actions={actions}>
      <Table
        caption={label('search.results')}
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        filterable={rows.length > 20}
        onRowClick={onOpen ?? ((r) => go('crView', { id: r.id }))}
      />
    </ResultsCard>
  );
}

const SENTENCES: [string, ConvictRow['outcomes'][number]][] = [
  ['communityService', 'community_service'],
  ['settlement', 'settlement'],
  ['probation', 'probation'],
  ['rehabilitation', 'rehabilitation'],
  ['governmentFee', 'government_fee'],
  ['imprisonment', 'imprisonment'],
  ['admonished', 'admonished'],
  ['suspendedSentence', 'suspended_sentence'],
];

export function ConvictResults({
  rows,
  actions,
  countText,
}: {
  rows: ConvictRow[];
  actions?: ReactNode;
  countText?: string;
}) {
  const { go } = useNav();
  const columns: Column<ConvictRow>[] = [
    { key: 'crNumber', title: c('crNumber'), value: (r) => r.crNumber },
    { key: 'accusedName', title: c('accusedName'), value: (r) => r.accusedName },
    { key: 'accusedNic', title: c('accusedNic'), value: (r) => r.accusedNic },
    { key: 'offenceCode', title: c('offenceCode'), value: (r) => r.offenceCode },
    { key: 'quantity', title: c('quantity'), value: (r) => r.quantity, numeric: true },
    { key: 'accusedAddress', title: c('accusedAddress'), value: (r) => r.accusedAddress },
    { key: 'courtName', title: c('courtName'), value: (r) => r.courtName },
    { key: 'caseNumber', title: c('caseNumber'), value: (r) => r.caseNumber },
    {
      key: 'convictedDate',
      title: c('convictedDate'),
      value: (r) => r.convictedDate,
      render: (r) => formatDate(r.convictedDate),
    },
    {
      key: 'fineAmount',
      title: c('fineAmount'),
      value: (r) => r.fineAmount,
      render: (r) => formatMoney(r.fineAmount),
      numeric: true,
      total: (rs) => formatMoney(rs.reduce((s, r) => s + (r.fineAmount ?? 0), 0)),
    },
    ...SENTENCES.map(([key, outcome]): Column<ConvictRow> => ({
      key,
      title: c(key),
      value: (r) => (r.outcomes.includes(outcome) ? 1 : 0),
      render: (r) =>
        r.outcomes.includes(outcome)
          ? outcome === 'imprisonment' && (r.prisonMonths || r.prisonDays)
            ? `✓ ${r.prisonMonths ?? 0}/${r.prisonDays ?? 0}`
            : '✓'
          : '',
    })),
  ];
  return (
    <ResultsCard count={rows.length} actions={actions} {...(countText ? { countText } : {})}>
      <Table
        caption={label('search.results')}
        rows={rows}
        rowKey={(r) => `${r.crimeReportId}`}
        columns={columns}
        filterable={rows.length > 20}
        onRowClick={(r) => go('crView', { id: r.crimeReportId })}
      />
    </ResultsCard>
  );
}

/**
 * "Print" (printer dialog), "Save as PDF" and "Open in Word" for one of D's print layouts. The Word
 * button saves a .docx and opens it, so staff can change it to their needs and print from Word.
 */
export function PrintButtons({
  print,
  printLabel = label('search.printList'),
  disabled,
}: {
  print: (target: 'printer' | 'pdf' | 'word') => Promise<string | boolean | null>;
  printLabel?: string;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const go = (target: 'printer' | 'pdf' | 'word') => async () => {
    setError(null);
    try {
      const r = await print(target);
      if (typeof r === 'string') toast(`${label('report.exported')} ${r}`);
    } catch (e) {
      setError(e instanceof IpcError ? e.caption : label('error.unknown'));
    }
  };
  return (
    <>
      <Button onClick={go('printer')} disabled={disabled}>
        {printLabel}
      </Button>
      <Button onClick={go('pdf')} disabled={disabled}>
        {label('search.savePdf')}
      </Button>
      <Button onClick={go('word')} disabled={disabled}>
        {label('search.openInWord')}
      </Button>
      {error && <span className="ex-field__error">{error}</span>}
    </>
  );
}
