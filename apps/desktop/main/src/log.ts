// Small file logger for the main process. One line per event, rotated at a size limit.
// Never log call arguments: they hold accused names, NICs and passwords.
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  readonly file: string;
  info(message: string): void;
  warn(message: string): void;
  error(message: string, err?: unknown): void;
}

const MAX_BYTES = 5 * 1024 * 1024;

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}\n${err.stack ?? ''}`.trimEnd();
  return String(err);
}

export function createFileLogger(file: string, maxBytes = MAX_BYTES): Logger {
  mkdirSync(dirname(file), { recursive: true });

  const write = (level: LogLevel, message: string) => {
    const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}\n`;
    try {
      if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > maxBytes) {
        // Keep one previous file: main.log -> main.log.1
        renameSync(file, `${file}.1`);
      }
      appendFileSync(file, line, 'utf8');
    } catch {
      // Logging must never break the app.
    }
    if (level === 'error') console.error(line.trimEnd());
  };

  return {
    file,
    info: (m) => write('info', m),
    warn: (m) => write('warn', m),
    error: (m, err) => write('error', err === undefined ? m : `${m} ${describe(err)}`),
  };
}
