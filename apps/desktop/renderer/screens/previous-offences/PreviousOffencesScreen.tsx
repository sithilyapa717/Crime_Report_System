// C8: previous-offence check (old `SearchF`, 11_prev.png): by full name or part of a name, or by
// NIC only; optionally limited to one court (the reports-menu variant, `SearchF1`). "Previous
// offences" lists them; "Report" prints the certificate සුරාබදු ඊ 48 (D's fixed layout).
import type { ConvictRow } from '@excise/contract';
import { label } from '@excise/labels';
import { useState, type FormEvent } from 'react';
import {
  Actions,
  Button,
  FieldGrid,
  FormSection,
  Select,
  TextField,
} from '../../design-system/index.js';
import { call } from '../../src/ipc.js';
import { useRefOptions } from '../../src/references.js';
import { ConvictResults, ErrorLine, PrintButtons, useRun } from '../shared/results.js';

export function PreviousOffencesScreen({ withCourt = false }: { withCourt?: boolean }) {
  const courts = useRefOptions('court');
  const [name, setName] = useState('');
  const [nic, setNic] = useState('');
  const [courtId, setCourtId] = useState<string | undefined>();
  const s = useRun<ConvictRow[]>();
  const query = () => ({
    ...(name.trim() ? { name } : {}),
    ...(nic.trim() ? { nic } : {}),
    ...(courtId ? { courtId } : {}),
  });
  const ready = name.trim() !== '' || nic.trim() !== '';
  const search = (e: FormEvent) => {
    e.preventDefault();
    void s.run(() => call('search.previousOffences', query()));
  };
  const title = label(withCourt ? 'reports.previousByCourt' : 'menu.previousOffences');
  return (
    <>
      <h1>{title}</h1>
      <form onSubmit={search} aria-label={title}>
        <FormSection title={label('search.go')}>
          <FieldGrid>
            <TextField label={label('search.name')} value={name} onChange={setName} />
            <TextField label={label('search.nic')} value={nic} onChange={setNic} />
            {withCourt && (
              <Select
                label={label('search.court')}
                value={courtId}
                options={courts}
                onChange={setCourtId}
              />
            )}
          </FieldGrid>
          <Actions>
            <PrintButtons
              disabled={!ready}
              printLabel={label('search.printCertificate')}
              print={(target) => call('print.certificateE48', query(), target)}
            />
            <Button type="submit" variant="primary" busy={s.busy} disabled={!ready}>
              {label('menu.previousOffences')}
            </Button>
          </Actions>
        </FormSection>
      </form>
      <ErrorLine error={s.error} />
      {s.result && <ConvictResults rows={s.result} />}
    </>
  );
}

export const PreviousByCourtScreen = () => <PreviousOffencesScreen withCourt />;
