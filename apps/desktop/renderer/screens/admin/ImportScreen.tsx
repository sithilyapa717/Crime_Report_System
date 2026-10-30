// Import from Access (OIC, one-time): a dry run checks the file and saves nothing; the real
// import then uses the same, checked file. The report lists every problem; it can be saved as CSV
// for staff to work through in Excel.
import type { ImportReport } from '@excise/contract';
import { label, REFERENCE_KIND_LABEL } from '@excise/labels';
import { useEffect, useState } from 'react';
import {
  Actions,
  Alert,
  Button,
  ConfirmDialog,
  FormSection,
  Table,
  formatMoney,
} from '../../design-system/index.js';
import { call } from '../../src/ipc.js';
import { forgetLists } from '../../src/references.js';
import './admin.css';
import { ErrorLine, useRun, useSavedToast } from '../shared/results.js';

export function ImportScreen() {
  const saved = useSavedToast();
  const s = useRun<ImportReport | null>();
  const [confirm, setConfirm] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    void s.run(() => call('import.lastReport'));
  }, []);

  const report = s.result;
  return (
    <>
      <h1>{label('admin.import')}</h1>
      <Alert kind="warn">{label('import.intro')}</Alert>
      <Actions>
        <Button
          busy={s.busy}
          onClick={() =>
            void s.run(async () => {
              const r = await call('import.dryRun');
              if (r) setChecked(true);
              return r ?? report;
            })
          }
        >
          {label('import.dryRun')}
        </Button>
        <Button variant="primary" disabled={!checked || s.busy} onClick={() => setConfirm(true)}>
          {label('import.run')}
        </Button>
        <Button
          disabled={!report}
          onClick={async () => {
            const path = await call('import.saveReport').catch(() => null);
            if (path) saved(path);
          }}
        >
          {label('import.saveReport')}
        </Button>
      </Actions>
      <ErrorLine error={s.error} />
      {report && <ReportView report={report} />}
      <ConfirmDialog
        open={confirm}
        title={label('import.run')}
        message={label('import.confirmRun')}
        confirmLabel={label('import.run')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          setChecked(false);
          void s.run(async () => {
            const r = await call('import.run');
            forgetLists();
            return r;
          });
        }}
      />
    </>
  );
}

function ReportView({ report: r }: { report: ImportReport }) {
  const dry = r.mode === 'dry_run';
  return (
    <>
      <FormSection
        title={`${label(`import.mode.${r.mode}`)} · ${r.finishedAt.slice(0, 16).replace('T', ' ')}`}
      >
        <dl className="import__numbers">
          <dt>{label('import.rowsRead')}</dt>
          <dd>{r.rowsRead}</dd>
          <dt>{label(dry ? 'import.wouldImport' : 'import.imported')}</dt>
          <dd>{r.imported}</dd>
          <dt>{label('import.skipped')}</dt>
          <dd>{r.skipped}</dd>
          {!dry && (
            <>
              <dt>{label('import.pictures')}</dt>
              <dd>{r.picturesCopied}</dd>
            </>
          )}
        </dl>
        {r.columns.unmapped.length > 0 && (
          <Alert kind="error">
            {label('import.unmapped')}: {r.columns.unmapped.join(', ')}
          </Alert>
        )}
        {Object.keys(r.columns.notStored).length > 0 && (
          <Alert kind="warn">
            {label('import.notStored')}:{' '}
            {Object.entries(r.columns.notStored)
              .map(([c, n]) => `${c} (${n})`)
              .join(', ')}
          </Alert>
        )}
      </FormSection>
      <FormSection title={label('import.totals')}>
        <Table
          rows={Object.keys(r.totals.crsByYear).sort()}
          rowKey={(y) => y}
          columns={[
            { key: 'year', title: label('cr.year'), value: (y) => y },
            {
              key: 'crs',
              title: label('report.count'),
              value: (y) => r.totals.crsByYear[y] ?? 0,
              numeric: true,
            },
            {
              key: 'fines',
              title: label('report.fineTotal'),
              value: (y) => r.totals.finesByYear[y] ?? 0,
              render: (y) => formatMoney(r.totals.finesByYear[y] ?? 0),
              numeric: true,
            },
          ]}
        />
      </FormSection>
      <FormSection title={`${label('import.exceptions')} (${r.exceptions.length})`}>
        <Table
          rows={r.exceptions.map((e, i) => ({ ...e, i }))}
          rowKey={(e) => String(e.i)}
          filterable={r.exceptions.length > 20}
          columns={[
            { key: 'row', title: label('import.row'), value: (e) => e.row },
            { key: 'column', title: label('import.column'), value: (e) => e.column },
            { key: 'value', title: label('import.value'), value: (e) => e.value },
            { key: 'reason', title: label('import.reason'), value: (e) => e.reason },
          ]}
        />
      </FormSection>
      <FormSection title={`${label('import.unverified')} (${r.unverifiedRefs.length})`}>
        <Table
          rows={r.unverifiedRefs.map((u, i) => ({ ...u, i }))}
          rowKey={(u) => String(u.i)}
          columns={[
            {
              key: 'kind',
              title: label('audit.table'),
              value: (u) => label(REFERENCE_KIND_LABEL[u.kind]),
            },
            { key: 'value', title: label('lists.value'), value: (u) => u.value },
          ]}
        />
      </FormSection>
    </>
  );
}
