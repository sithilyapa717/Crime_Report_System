// C8: previous-offence check (old `SearchF`, 11_prev.png): by full name or part of a name, or by
// NIC only; optionally limited to one court (the reports-menu variant, `SearchF1`). The results
// card lists the earlier convictions and prints the certificate සුරාබදු ඊ 48 (D's fixed layout).
import type { ConvictRow } from '@excise/contract';
import { label } from '@excise/labels';
import { useState, type FormEvent } from 'react';
import { Button, Card, Select, TextField } from '../../design-system/index.js';
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
      <Card>
        <form className="ex-filters" onSubmit={search} aria-label={title}>
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
          <Button type="submit" variant="primary" busy={s.busy} disabled={!ready}>
            {label('menu.previousOffences')}
          </Button>
        </form>
      </Card>
      <ErrorLine error={s.error} />
      {s.result && (
        <ConvictResults
          rows={s.result}
          countText={`${label('search.previousCount')} ${s.result.length}`}
          actions={
            <PrintButtons
              disabled={!ready}
              printLabel={label('search.printCertificate')}
              print={(target) => call('print.certificateE48', query(), target)}
            />
          }
        />
      )}
    </>
  );
}

export const PreviousByCourtScreen = () => <PreviousOffencesScreen withCourt />;
