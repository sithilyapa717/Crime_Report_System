// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { MENUS, allowed } from '../shell/routes.js';
import { formatDate, formatMoney, parseDateInput } from './dates.js';
import { DateField, NumberField, Select } from './fields.js';
import { Tabs } from './layout.js';
import { Table } from './table.js';

afterEach(cleanup);

describe('dates and money', () => {
  it('shows YYYY.MM.DD and reads what staff type', () => {
    expect(formatDate('2026-01-02')).toBe('2026.01.02');
    expect(formatDate(null)).toBe('');
    expect(parseDateInput('2026.1.2')).toBe('2026-01-02');
    expect(parseDateInput('2026/12/31')).toBe('2026-12-31');
    expect(parseDateInput('2026.02.30')).toBeNull();
    expect(parseDateInput('02.01.2026')).toBeNull();
    expect(formatMoney(150050)).toBe('1,500.50');
  });
});

describe('fields', () => {
  it('DateField gives ISO to the form and flags text it cannot read', () => {
    const seen: (string | undefined)[] = [];
    function Host() {
      const [v, setV] = useState<string | undefined>('2026-01-02');
      return (
        <DateField
          label="Date"
          value={v}
          onChange={(x) => {
            seen.push(x);
            setV(x);
          }}
        />
      );
    }
    render(<Host />);
    const input = screen.getByLabelText('Date') as HTMLInputElement;
    expect(input.value).toBe('2026.01.02');
    fireEvent.change(input, { target: { value: '2026.3.4' } });
    fireEvent.blur(input);
    expect(seen.at(-1)).toBe('2026-03-04');
    expect(input.value).toBe('2026.03.04');
    fireEvent.change(input, { target: { value: '2026.99.99' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(input, { target: { value: '' } });
    expect(seen.at(-1)).toBeUndefined();
  });

  it('NumberField: empty is "no value", letters are refused', () => {
    const seen: (number | undefined)[] = [];
    render(<NumberField label="Qty" value={5} onChange={(v) => seen.push(v)} />);
    const input = screen.getByLabelText('Qty');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '1x' } });
    expect(seen).toEqual([12, undefined, 5]);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('Select filters long lists but keeps the chosen option', () => {
    const options = Array.from({ length: 20 }, (_, i) => ({
      value: String(i),
      label: `Officer ${i}`,
    }));
    render(<Select label="Officer" value="3" onChange={() => undefined} options={options} />);
    fireEvent.change(screen.getByLabelText('Officer: පෙරහන'), { target: { value: 'officer 1' } });
    const shown = screen.getAllByRole('option').map((o) => o.textContent);
    expect(shown).toContain('Officer 3');
    expect(shown).toContain('Officer 12');
    expect(shown).not.toContain('Officer 4');
  });
});

describe('Tabs and Table', () => {
  it('tabs switch with the arrow keys', () => {
    render(
      <Tabs
        label="CR"
        tabs={[
          { key: 'a', title: 'First', content: <p>one</p> },
          { key: 'b', title: 'Second', content: <p>two</p> },
        ]}
      />,
    );
    expect(screen.getByText('two').closest('[role=tabpanel]')?.hasAttribute('hidden')).toBe(true);
    act(() => {
      fireEvent.keyDown(screen.getByRole('tab', { name: 'First' }), { key: 'ArrowRight' });
    });
    expect(screen.getByRole('tab', { name: 'Second' }).getAttribute('aria-selected')).toBe('true');
  });

  it('table sorts by a heading and adds totals', () => {
    const rows = [
      { id: '1', name: 'B', fine: 200 },
      { id: '2', name: 'A', fine: 100 },
    ];
    render(
      <Table
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: 'name', title: 'Name', value: (r) => r.name },
          {
            key: 'fine',
            title: 'Fine',
            value: (r) => r.fine,
            numeric: true,
            total: (rs) => rs.reduce((s, r) => s + r.fine, 0),
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    const cells = screen.getAllByRole('row').map((r) => r.textContent);
    expect(cells).toEqual(['Name ▲Fine', 'A100', 'B200', '300']);
  });
});

describe('role menus', () => {
  it('match §1.2: no CR entry for observers, list editor and admin for the OIC only', () => {
    expect(allowed('observation', 'crEntry')).toBe(false);
    expect(allowed('supervising', 'caseProgress')).toBe(false);
    expect(allowed('detecting', 'crEntry')).toBe(true);
    expect(allowed('detecting', 'referenceLists')).toBe(false);
    expect(allowed('oic', 'backup')).toBe(true);
    for (const role of ['detecting', 'observation', 'supervising'] as const) {
      expect(MENUS[role].admin).toEqual([]);
      expect(allowed(role, 'changePassword')).toBe(true);
    }
  });
});
