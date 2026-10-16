import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createFileLogger } from './log.js';

const tempFile = () => join(mkdtempSync(join(tmpdir(), 'excise-log-')), 'logs', 'main.log');

describe('file logger', () => {
  it('writes timestamped lines and creates the folder', () => {
    const log = createFileLogger(tempFile());
    log.info('started');
    log.warn('login failed for oic');
    const lines = readFileSync(log.file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T.* INFO started$/);
    expect(lines[1]).toMatch(/ WARN login failed for oic$/);
  });

  it('includes the stack for errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = createFileLogger(tempFile());
    log.error('boom', new TypeError('bad thing'));
    expect(readFileSync(log.file, 'utf8')).toContain('ERROR boom TypeError: bad thing');
    spy.mockRestore();
  });

  it('rotates to .1 when the file passes the limit', () => {
    const log = createFileLogger(tempFile(), 50);
    log.info('x'.repeat(60));
    log.info('after rotation');
    expect(existsSync(`${log.file}.1`)).toBe(true);
    expect(readFileSync(log.file, 'utf8')).toContain('after rotation');
    expect(readFileSync(log.file, 'utf8')).not.toContain('xxxx');
  });
});
