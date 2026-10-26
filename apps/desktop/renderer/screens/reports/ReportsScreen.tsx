// C7: the reports menu (old `menu form6` and its 9 selector screens: monthly / half-year / yearly
// × all / by detecting officer / by informant). The office, year and month are asked once
// (REWRITE_PLAN §1.8); period, person and type are chips (Figma "05 Reports"), and a type chip
// runs its report straight away, as the old type buttons did. Results show with
// Sinhala headings and totals, and export to Excel/CSV or print with D's register layout.
import type { ReportResult, SummaryGroup } from '@excise/contract';
import { label } from '@excise/labels';
import type { ReportParams, ReportType, SummaryGroupBy } from '@excise/schemas';
import { useEffect, useRef, useState } from 'react';
import {
  Actions,
  Button,
  Card,
  Select,
  Table,
  formatDate,
  formatMoney,
  useToast,
  type Column,
} from '../../design-system/index.js';
import { useNav } from '../../shell/navigation.js';
import { call, IpcError } from '../../src/ipc.js';
import { useRefOptions } from '../../src/references.js';
import { SEIZED } from '../shared/cr-model.js';
import {
  ErrorLine,
  MONTH_OPTIONS,
  PrintButtons,
  useOfficeYear,
  useRun,
} from '../shared/results.js';
import './reports.css';

type Period = 'month' | 'half_year' | 'year';
type Person = 'none' | 'detecting_officer' | 'informant';

const TYPES: ReportType[] = [
  'register',
  'warrant',
  'trial',
  'summons',
  'not_filed',
  'fines_not_collected',
  'rewards_due',
  'resolved',
  'fines_earned',
  'convicts',
];
const SUMMARIES: SummaryGroupBy[] = ['offence', 'detecting_officer', 'informant'];
const MONEY = new Set(['fineAmount']);
const DATES = new Set(['detectionDate', 'courtDate', 'convictedDate']);
/** Convicts report: 1 means "this sentence was given". */
const TICKS = new Set([
  'communityService',
  'settlement',
  'probation',
  'rehabilitation',
  'governmentFee',
  'imprisonment',
  'admonished',
  'suspendedSentence',
]);

type Shown =
  | { kind: 'report'; type: ReportType; result: ReportResult }
  | { kind: 'summary'; by: SummaryGroupBy; groups: SummaryGroup[] };

export function ReportsScreen() {
  const { session, go } = useNav();
  const toast = useToast();
  const byOfficerAllowed = session.role !== 'observation';
  const { officeId, year, fields } = useOfficeYear();
  const [period, setPeriod] = useState<Period>('month');
  const [person, setPerson] = useState<Person>('none');
  const [month, setMonth] = useState<string | undefined>(String(new Date().getMonth() + 1));
  const [half, setHalf] = useState<'first' | 'second'>('first');
  const [officerId, setOfficerId] = useState<string | undefined>();
  const officers = useRefOptions(person === 'informant' ? 'informant' : 'detecting_officer');
  const s = useRun<Shown>();

  const params = (type: ReportType): ReportParams | null => {
    if (!officeId || !year) return null;
    if (period === 'month' && !month) return null;
    if (person !== 'none' && !officerId) return null;
    const scope =
      period === 'month'
        ? { kind: 'month' as const, officeId, year, month: Number(month) }
        : period === 'half_year'
          ? { kind: 'half_year' as const, officeId, year, half }
          : { kind: 'year' as const, officeId, year };
    return {
      scope,
      person: person === 'none' ? { kind: 'none' } : { kind: person, officerId: officerId! },
      type,
    };
  };
  const ready = params('register') !== null;

  // Changing a filter re-runs the report on show (or clears it while a choice is missing).
  const filterKey = JSON.stringify(params('register'));
  const shownRef = useRef(s.result);
  shownRef.current = s.result;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const shown = shownRef.current;
    if (!shown) return;
    if (!ready) s.setResult(null);
    else if (shown.kind === 'report') runReport(shown.type);
    else runSummary(shown.by);
  }, [filterKey]);

  const runReport = (type: ReportType) => {
    const p = params(type);
    if (p) void s.run(async () => ({ kind: 'report', type, result: await call('reports.run', p) }));
  };
  const runSummary = (by: SummaryGroupBy) => {
    const p = params('register');
    if (p)
      void s.run(async () => ({
        kind: 'summary',
        by,
        groups: await call('reports.summary', p, by),
      }));
  };
  // Back to the screen's starting choices (the office and year stay: they are asked once).
  const clear = () => {
    setPeriod('month');
    setPerson('none');
    setOfficerId(undefined);
    setMonth(String(new Date().getMonth() + 1));
    setHalf('first');
    s.setResult(null);
  };
  const exportTo = (format: 'xlsx' | 'csv') => async () => {
    if (s.result?.kind !== 'report') return;
    const p = params(s.result.type);
    if (!p) return;
    try {
      const path = await call('reports.export', p, format);
      if (path) toast(`${label('report.exported')} ${path}`);
    } catch (e) {
      toast(e instanceof IpcError ? e.caption : label('error.unknown'), 'error');
    }
  };

  return (
    <div className="reports">
      <Card className="report-filters">
        <div className="ex-filters">
          {fields}
          <Select
            label={label('report.scope')}
            value={period}
            onChange={(v) => setPeriod((v as Period) ?? 'month')}
            options={[
              { value: 'year', label: label('cr.year') },
              { value: 'month', label: label('cr.month') },
              { value: 'half_year', label: label('report.half') },
            ]}
          />
          {period === 'month' && (
            <Select
              label={label('cr.month')}
              value={month}
              options={MONTH_OPTIONS}
              onChange={setMonth}
            />
          )}
          {period === 'half_year' && (
            <Select
              label={label('report.half')}
              value={half}
              onChange={(v) => setHalf((v as 'first' | 'second') ?? 'first')}
              options={[
                { value: 'first', label: label('cr.halfYear.first') },
                { value: 'second', label: label('cr.halfYear.second') },
              ]}
            />
          )}
          {byOfficerAllowed && (
            <Select
              label={label('report.person')}
              value={person}
              onChange={(v) => {
                setPerson((v as Person) ?? 'none');
                setOfficerId(undefined);
              }}
              options={[
                { value: 'none', label: label('report.personNone') },
                { value: 'detecting_officer', label: label('reports.byDetectingOfficer') },
                { value: 'informant', label: label('reports.byInformant') },
              ]}
            />
          )}
          {byOfficerAllowed && person !== 'none' && (
            <Select
              label={label(person === 'informant' ? 'cr.informant' : 'cr.detectingOfficer')}
              value={officerId}
              options={officers}
              onChange={setOfficerId}
            />
          )}
          <Button variant="ghost" className="report-filters__clear" onClick={clear}>
            {label('report.clear')}
          </Button>
        </div>
      </Card>

      {/* Each choice runs its report straight away and shows it below; changing a filter
          above re-runs whatever is showing. */}
      <Card className="report-pick">
        {!ready && <p className="ex-muted">{label('report.fillFilters')}</p>}
        <div className="report-pick__groups">
          <fieldset className="ex-chips">
            <legend className="ex-chips__label">{label('report.type')}</legend>
            <div className="ex-chips__list">
              {TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="ex-chip"
                  aria-pressed={s.result?.kind === 'report' && s.result.type === t}
                  disabled={!ready || s.busy}
                  onClick={() => runReport(t)}
                >
                  {label(`report.typeChip.${t}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="ex-chips">
            <legend className="ex-chips__label">{label('report.summary')}</legend>
            <div className="ex-chips__list">
              {SUMMARIES.map((by) => (
                <button
                  key={by}
                  type="button"
                  className="ex-chip"
                  aria-pressed={s.result?.kind === 'summary' && s.result.by === by}
                  disabled={!ready || s.busy}
                  onClick={() => runSummary(by)}
                >
                  {label(`report.summary.${by}`)}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="report-links">
          <Button onClick={() => go('caseNumberSearch')}>{label('reports.byCaseNumber')}</Button>
          <Button onClick={() => go('nameNicSearch')}>{label('reports.byNameNic')}</Button>
          <Button onClick={() => go('previousByCourt')}>{label('reports.previousByCourt')}</Button>
        </div>
      </Card>

      <ErrorLine error={s.error} />
      {s.result?.kind === 'report' && (
        <Card title={label(`report.typeChip.${s.result.type}`)} className="ex-card--fill">
          <ReportTable result={s.result.result} />
          <div className="ex-results-foot">
            <span />
            <Actions>
              <Button onClick={exportTo('xlsx')}>{label('report.exportXlsx')}</Button>
              <Button onClick={exportTo('csv')}>{label('report.exportCsv')}</Button>
              <PrintButtons
                print={(target) =>
                  call('print.register', params((s.result as { type: ReportType }).type)!, target)
                }
              />
            </Actions>
          </div>
        </Card>
      )}
      {s.result?.kind === 'summary' && (
        <Card
          title={`${label('report.summary')} – ${label(`report.summary.${s.result.by}`)}`}
          className="ex-card--fill"
        >
          <SummaryTable groups={s.result.groups} />
        </Card>
      )}
    </div>
  );
}

type Row = ReportResult['rows'][number] & { __i: number };

export function ReportTable({ result }: { result: ReportResult }) {
  const rows: Row[] = result.rows.map((r, i) => ({ ...r, __i: i }));
  const columns: Column<Row>[] = result.columns.map((c) => ({
    key: c.key,
    title: label(c.labelKey),
    value: (r) => r[c.key] ?? null,
    numeric: MONEY.has(c.key) || c.key === 'quantity',
    render: (r) => {
      const v = r[c.key];
      if (v === null || v === undefined) return '';
      if (MONEY.has(c.key)) return formatMoney(Number(v));
      if (DATES.has(c.key)) return formatDate(String(v));
      if (TICKS.has(c.key)) return v ? '✓' : '';
      return v;
    },
    ...(MONEY.has(c.key) ? { total: () => formatMoney(result.fineTotal) } : {}),
  }));
  return (
    <>
      <p className="ex-muted">
        {label('report.count')}: {rows.length} · {label('report.fineTotal')}:{' '}
        {formatMoney(result.fineTotal)}
      </p>
      <Table
        rows={rows}
        rowKey={(r) => String(r.__i)}
        columns={columns}
        filterable={rows.length > 20}
      />
    </>
  );
}

function SummaryTable({ groups }: { groups: SummaryGroup[] }) {
  const items = SEIZED.filter(({ type }) => groups.some((g) => g.quantities[type]));
  const sum = (f: (g: SummaryGroup) => number) => groups.reduce((s, g) => s + f(g), 0);
  const columns: Column<SummaryGroup>[] = [
    {
      key: 'label',
      title: label('report.col.offenceCode'),
      value: (g) => g.label || g.key,
      total: () => label('report.total'),
    },
    {
      key: 'count',
      title: label('report.count'),
      value: (g) => g.count,
      numeric: true,
      total: () => sum((g) => g.count),
    },
    ...items.map(({ type }): Column<SummaryGroup> => ({
      key: type,
      title: label(`seized.${type}`),
      value: (g) => g.quantities[type] ?? 0,
      numeric: true,
      total: () => Math.round(sum((g) => g.quantities[type] ?? 0) * 1000) / 1000,
    })),
    {
      key: 'quantityTotal',
      title: label('report.quantityTotal'),
      value: (g) => g.quantityTotal,
      numeric: true,
      total: () => sum((g) => g.quantityTotal),
    },
    {
      key: 'fineTotal',
      title: label('report.fineTotal'),
      value: (g) => g.fineTotal,
      render: (g) => formatMoney(g.fineTotal),
      numeric: true,
      total: () => formatMoney(sum((g) => g.fineTotal)),
    },
  ];
  return <Table rows={groups} rowKey={(g) => g.key || '-'} columns={columns} />;
}
