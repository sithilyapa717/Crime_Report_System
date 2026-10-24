import { describe, expect, it } from 'vitest';
import { label } from '@excise/labels';
import { databaseFailure, IpcError } from './ipc.js';

describe('databaseFailure', () => {
  it('explains a database rejection the application already accepted', () => {
    const text = databaseFailure(
      new IpcError(
        'SqliteError',
        'detecting_officer_id must be a detecting_officer',
        'SQLITE_CONSTRAINT_TRIGGER',
      ),
    );
    expect(text).toBe(
      `${label('error.db.detectingOfficer')}\ndetecting_officer_id must be a detecting_officer`,
    );
  });

  it('keeps the database text for a duplicate row', () => {
    const raw = 'UNIQUE constraint failed: seized_items.crime_report_id, seized_items.position';
    expect(databaseFailure(new IpcError('SqliteError', raw, 'SQLITE_CONSTRAINT_UNIQUE'))).toBe(
      `${label('error.db.unique')}\n${raw}`,
    );
  });

  it('leaves field validation to the form', () => {
    expect(
      databaseFailure(
        new IpcError('CrValidationError', 'no', 'bad_format', [
          { field: 'crNumber', code: 'bad_format' },
        ]),
      ),
    ).toBeNull();
  });
});
