import { useState } from 'react';
import { SaveFailedDialog } from '../design-system/index.js';
import { databaseFailure } from './ipc.js';

/** Opens the "failed to save" dialog when the database rejects an approved save. */
export function useSaveFailure() {
  const [detail, setDetail] = useState<string | null>(null);
  return {
    report(err: unknown) {
      const text = databaseFailure(err);
      if (!text) return false;
      setDetail(text);
      return true;
    },
    dialog: (
      <SaveFailedDialog
        open={detail !== null}
        detail={detail ?? ''}
        onClose={() => setDetail(null)}
      />
    ),
  };
}
