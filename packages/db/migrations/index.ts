// The SQL migrations, embedded in the code so the installer has no .sql files to ship.
// Add a new file here in name order; never edit one that has shipped.
import initial from './0001_initial.sql?raw';
import views from './0002_views.sql?raw';
import cashPosition from './0003_cash_position.sql?raw';
import integrity from './0004_integrity.sql?raw';

export const MIGRATIONS: { name: string; sql: string }[] = [
  { name: '0001_initial', sql: initial },
  { name: '0002_views', sql: views },
  { name: '0003_cash_position', sql: cashPosition },
  { name: '0004_integrity', sql: integrity },
];
