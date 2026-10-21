// D10: "ලේඛන සාදන්න". Lists the templates for the CR's offence by family (current ones first,
// "unconfirmed" ones marked), makes the .docx (and a PDF when Word is installed), shows the coded
// warnings in Sinhala, and opens the file or its folder. Earlier documents are listed below.
// Files are named, never passed as paths: the main process finds them in the CR's history.
import { label } from '@excise/labels';
import { useEffect, useState } from 'react';
import {
  Actions,
  Alert,
  Badge,
  Button,
  Checkbox,
  Dialog,
  FormSection,
  Spinner,
  Table,
  formatDate,
} from '../design-system/index.js';
import { call, IpcError, type Result } from '../src/ipc.js';
import './documents-dialog.css';

type Data = Result<'documents.listFor'>;
type Made = Result<'documents.generate'>;
type Template = Data['groups'][number]['templates'][number];
type HistoryEntry = Data['history'][number];

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

export function variantText(v: Template['variant']): string {
  return [
    v.container ? label(`documents.variant.${v.container}`) : null,
    v.sample ? label('documents.variant.sample') : null,
    v.volumeMl ? `${v.volumeMl} ml` : null,
    v.noteRs ? `Rs ${v.noteRs}` : null,
    v.offences ? `${v.offences} ${label('documents.variant.offences')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function DocumentsDialog({
  crimeReportId,
  open,
  onClose,
}: {
  crimeReportId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [pdf, setPdf] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    call('documents.listFor', crimeReportId)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof IpcError ? e.caption : label('error.unknown')));

  useEffect(() => {
    if (open) {
      setMade(null);
      setError(null);
      void load();
    }
  }, [open, crimeReportId]);

  const generate = async (t: Template) => {
    setBusy(t.id);
    setError(null);
    setMade(null);
    try {
      setMade(await call('documents.generate', crimeReportId, t.id, pdf ? { pdf: true } : {}));
      await load();
    } catch (e) {
      setError(e instanceof IpcError ? e.caption : label('error.unknown'));
    } finally {
      setBusy(null);
    }
  };

  const openFile =
    (fileName: string, folder = false) =>
    () => {
      call(folder ? 'documents.showInFolder' : 'documents.open', crimeReportId, fileName).catch(
        (e: unknown) => setError(e instanceof IpcError ? e.caption : label('error.unknown')),
      );
    };

  return (
    <Dialog open={open} onClose={onClose} title={label('documents.title')} wide>
      {!data && !error && <Spinner />}
      {error && <Alert kind="error">{error}</Alert>}
      {data && (
        <>
          <p>
            <strong>{data.crNumber}</strong> · {data.offenceCode}
          </p>
          {made && (
            <Alert kind={made.warnings.length ? 'warn' : 'ok'}>
              <p>
                {label('documents.made')} <strong>{made.fileName}</strong>
              </p>
              {made.warnings.length > 0 && (
                <ul>
                  {made.warnings.map((w, i) => (
                    <li key={i}>
                      {label(`documents.warning.${w.code}`)}
                      {w.code === 'empty_fields' && ` ${w.detail}`}
                    </li>
                  ))}
                </ul>
              )}
              <Actions>
                <Button onClick={openFile(made.fileName, true)}>
                  {label('documents.showInFolder')}
                </Button>
                {made.pdfPath && <Button onClick={openFile(baseName(made.pdfPath))}>PDF</Button>}
                <Button variant="primary" onClick={openFile(made.fileName)}>
                  {label('documents.open')}
                </Button>
              </Actions>
            </Alert>
          )}
          {data.pdfAvailable && (
            <Checkbox label={label('documents.pdf')} checked={pdf} onChange={setPdf} />
          )}
          {data.groups.length === 0 && <p className="ex-muted">{label('documents.none')}</p>}
          <div className="documents__groups">
            {data.groups.map((g) => (
              <FormSection key={g.family} title={label(`documents.family.${g.family}`)}>
                <ul className="documents__list">
                  {g.templates.map((t) => (
                    <li key={t.id}>
                      <span className="documents__title">
                        {t.title}
                        {variantText(t.variant) && (
                          <span className="ex-muted"> · {variantText(t.variant)}</span>
                        )}{' '}
                        {t.status === 'unconfirmed' && (
                          <Badge kind="warn">{label('documents.status.unconfirmed')}</Badge>
                        )}
                      </span>
                      <Button
                        busy={busy === t.id}
                        disabled={!!busy}
                        onClick={() => void generate(t)}
                        aria-label={`${label('documents.generate')}: ${t.title}`}
                      >
                        {label('documents.generate')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </FormSection>
            ))}
          </div>
          {data.history.length > 0 && (
            <FormSection title={label('documents.history')}>
              <Table<HistoryEntry>
                rows={data.history}
                rowKey={(h) => h.id}
                columns={[
                  {
                    key: 'when',
                    title: label('documents.when'),
                    value: (h) => h.generatedAt,
                    render: (h) => `${formatDate(h.generatedAt)} ${h.generatedAt.slice(11, 16)}`,
                  },
                  { key: 'file', title: label('documents.file'), value: (h) => h.fileName },
                  {
                    key: 'open',
                    title: '',
                    value: () => null,
                    render: (h) => (
                      <Button variant="ghost" onClick={openFile(h.fileName)}>
                        {label('documents.open')}
                      </Button>
                    ),
                  },
                ]}
              />
            </FormSection>
          )}
          <Actions>
            <Button onClick={onClose}>{label('common.close')}</Button>
          </Actions>
        </>
      )}
    </Dialog>
  );
}

/** The button for CR entry and CR view; only roles that may make documents see it. */
export function DocumentsButton({ crimeReportId, role }: { crimeReportId: string; role: string }) {
  const [open, setOpen] = useState(false);
  if (role !== 'oic' && role !== 'detecting') return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>{label('documents.button')}</Button>
      <DocumentsDialog crimeReportId={crimeReportId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
