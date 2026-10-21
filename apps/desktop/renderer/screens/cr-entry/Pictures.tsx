// Pictures attached to a CR (A9 file store). The file is chosen in the main process's own dialog.
import type { StoredFile } from '@excise/contract';
import { label } from '@excise/labels';
import { useEffect, useState } from 'react';
import { Alert, Button, FormSection } from '../../design-system/index.js';
import { call, IpcError } from '../../src/ipc.js';

export function Pictures({
  crimeReportId,
  readOnly,
  compact,
}: {
  crimeReportId: string;
  readOnly?: boolean;
  /** Header strip (Figma CR entry): small thumbnails that open the file, and the add button. */
  compact?: boolean;
}) {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const list = await call('files.list', crimeReportId);
    setFiles(list);
    const shown: Record<string, string | null> = {};
    for (const f of list) shown[f.id] = await call('files.preview', f.id);
    setPreviews(shown);
  };

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [crimeReportId]);

  const run = (fn: () => Promise<unknown>) => () => {
    setError(null);
    fn()
      .then(refresh)
      .catch((e: unknown) => setError(e instanceof IpcError ? e.caption : label('error.unknown')));
  };

  if (compact)
    return (
      <div className="pictures pictures--compact" role="group" aria-label={label('cr.picture')}>
        {files.length === 0 && <span className="pictures__empty" aria-hidden="true" />}
        {files.map((f) => (
          <button
            key={f.id}
            type="button"
            className="pictures__thumb"
            title={f.originalName}
            onClick={run(() => call('files.open', f.id))}
          >
            {previews[f.id] ? (
              <img src={previews[f.id]!} alt={f.originalName} />
            ) : (
              <span className="ex-visually-hidden">{f.originalName}</span>
            )}
          </button>
        ))}
        {!readOnly && (
          <Button onClick={run(() => call('files.attach', crimeReportId))}>
            {label('cr.attach')}
          </Button>
        )}
        {error && <span className="ex-field__error">{error}</span>}
      </div>
    );

  return (
    <FormSection title={label('cr.picture')}>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="pictures">
        {files.map((f) => (
          <figure key={f.id} className="pictures__item">
            {previews[f.id] ? (
              <img src={previews[f.id]!} alt={f.originalName} />
            ) : (
              <span className="ex-badge">{f.originalName}</span>
            )}
            <figcaption>
              <Button variant="ghost" onClick={run(() => call('files.open', f.id))}>
                {label('cr.openFile')}
              </Button>
              {!readOnly && (
                <Button variant="ghost" onClick={run(() => call('files.remove', f.id))}>
                  {label('cr.remove')}
                </Button>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      {!readOnly && (
        <Button onClick={run(() => call('files.attach', crimeReportId))}>
          {label('cr.attach')}
        </Button>
      )}
    </FormSection>
  );
}
