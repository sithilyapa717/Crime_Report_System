import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { FIELDS, formatValue, lookupField } from './fields.ts';
import { formatDate, formatMoney, formatNumber, formatTime } from './format.ts';
import { SAMPLE_CR } from './sample-data.ts';

test('dates: old format, real calendar dates only', () => {
  assert.equal(formatDate('2026-01-15'), '2026.01.15');
  assert.equal(formatDate('2026.1.5'), '2026.01.05');
  assert.equal(formatDate(' 2026/12/31 '), '2026.12.31');
  assert.equal(formatDate('2024-02-29'), '2024.02.29', 'leap day');
  for (const bad of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-01-00', '15/01/2026', '', 'abc']) {
    assert.throws(() => formatDate(bad), `${bad} must be refused`);
  }
  assert.equal(formatDate(new Date(2026, 0, 15)), '2026.01.15');
  assert.throws(() => formatDate(new Date('nonsense')));
});

test('times: HH.MM, real times only', () => {
  assert.equal(formatTime('14:45'), '14.45');
  assert.equal(formatTime('9:05'), '09.05');
  assert.equal(formatTime('09.05'), '09.05');
  assert.equal(formatTime('23:59:59'), '23.59');
  assert.equal(formatTime('00:00'), '00.00');
  for (const bad of ['24:00', '12:60', '12:30:61', '1230', '', '7']) assert.throws(() => formatTime(bad), bad);
  assert.equal(formatTime(new Date(2026, 0, 1, 7, 3)), '07.03');
  assert.throws(() => formatTime(new Date('nonsense')));
});

test('money: from integer cents, no separators, cents only when present', () => {
  assert.equal(formatMoney(0), '0');
  assert.equal(formatMoney(5), '0.05');
  assert.equal(formatMoney(2500000), '25000');
  assert.equal(formatMoney(2500050), '25000.50');
  assert.equal(formatMoney(-150), '-1.50');
  assert.throws(() => formatMoney(1.5));
  assert.throws(() => formatMoney(Number.MAX_SAFE_INTEGER + 2));
  assert.throws(() => formatMoney(Number.NaN));
});

test('numbers: plain, no floating-point noise', () => {
  assert.equal(formatNumber(750), '750');
  assert.equal(formatNumber(1.5), '1.5');
  assert.equal(formatNumber(0.1 + 0.2), '0.3');
  assert.equal(formatNumber(-0), '0');
  assert.equal(formatNumber(180.1234564), '180.123456');
  assert.throws(() => formatNumber(Number.POSITIVE_INFINITY));
});

test('field names and aliases are unique and all resolve, ignoring case', () => {
  const names = FIELDS.flatMap((f) => [f.name, ...(f.aliases ?? []).map((a) => a.name)].map((n) => n.toLowerCase()));
  assert.equal(new Set(names).size, names.length);
  for (const f of FIELDS) {
    assert.equal(lookupField(f.name)?.name, f.name);
    assert.equal(lookupField(f.name.toUpperCase())?.name, f.name);
    for (const a of f.aliases ?? []) assert.equal(lookupField(a.name)?.name, f.name, a.name);
  }
});

test('every merge field found in the templates is mapped', () => {
  const inventory = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'registry', 'template-inventory.json'), 'utf8'),
  ) as { templates: { mergeFields: string[] }[] };
  const used = new Set(inventory.templates.flatMap((t) => t.mergeFields));
  for (const name of used) assert.ok(lookupField(name), `${name} is not mapped`);
});

test('formatValue: each kind, and no value stays "no value"', () => {
  const def = (n: string) => {
    const d = lookupField(n);
    assert.ok(d);
    return d;
  };
  assert.equal(formatValue(def('Name_of_Accused'), 'කේ. සමන්'), 'කේ. සමන්');
  assert.equal(formatValue(def('Name_of_Accused'), new Date(2026, 0, 2)), '2026.01.02');
  assert.equal(formatValue(def('Date_of_Detection'), '2026-01-15'), '2026.01.15');
  assert.equal(formatValue(def('Time_of_Detection'), '14:45'), '14.45');
  assert.equal(formatValue(def('Quantity'), 750), '750');
  assert.equal(formatValue(def('Quantity'), '750 ml'), '750 ml', 'text in a number field is kept as entered');
  assert.equal(formatValue(def('result'), 2500000), '25000');
  assert.throws(() => formatValue(def('result'), '25000'), /integer cents/);
  assert.equal(formatValue(def('Quantity'), null), undefined);
  assert.equal(formatValue(def('Quantity'), undefined), undefined);
  assert.equal(formatValue(def('Name_of_Accused'), ''), '', 'an empty string is a value (prints empty)');
});

test('the sample CR has a valid value for every field kind', () => {
  for (const f of FIELDS) {
    const v = SAMPLE_CR[f.name];
    if (v === undefined || v === null) continue;
    assert.doesNotThrow(() => formatValue(f, v), f.name);
  }
});
