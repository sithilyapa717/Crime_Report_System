// Data table with click-to-sort headings, an optional text filter and a totals row. Enough for the
// search results and reports; very long results are paged rather than virtualised.
import { useMemo, useState, type ReactNode } from 'react';
import { label } from '@excise/labels';
import { EmptyState } from './feedback.js';
import { Icon } from './icons.js';

export interface Column<R> {
  key: string;
  title: string;
  value: (row: R) => string | number | null;
  render?: (row: R) => ReactNode;
  numeric?: boolean;
  /** Shown in the totals row (e.g. a sum). */
  total?: (rows: R[]) => ReactNode;
}

const PAGE = 500;

export function Table<R>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  caption,
  filterable,
}: {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R) => string;
  onRowClick?: (row: R) => void;
  /** Highlights one row (the CR last opened from this list). */
  selectedKey?: string | undefined;
  caption?: string;
  filterable?: boolean;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [filter, setFilter] = useState('');
  const [shown, setShown] = useState(PAGE);

  const visible = useMemo(() => {
    let out = rows;
    if (filter) {
      const f = filter.toLowerCase();
      out = out.filter((r) =>
        columns.some((c) =>
          String(c.value(r) ?? '')
            .toLowerCase()
            .includes(f),
        ),
      );
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        out = [...out].sort((a, b) => {
          const x = col.value(a);
          const y = col.value(b);
          if (x === y) return 0;
          if (x === null) return 1;
          if (y === null) return -1;
          return (
            (typeof x === 'number' && typeof y === 'number'
              ? x - y
              : String(x).localeCompare(String(y))) * sort.dir
          );
        });
      }
    }
    return out;
  }, [rows, columns, sort, filter]);

  const hasTotals = columns.some((c) => c.total);
  return (
    <div>
      {filterable && (
        <input
          className="ex-input ex-table-filter"
          aria-label={label('common.filter')}
          placeholder="…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      {visible.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="ex-table-wrap">
          <table className="ex-table">
            {caption && <caption className="ex-visually-hidden">{caption}</caption>}
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={c.numeric ? 'num' : undefined}
                    aria-sort={
                      sort?.key === c.key
                        ? sort.dir === 1
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSort((s) =>
                          s?.key === c.key
                            ? { key: c.key, dir: s.dir === 1 ? -1 : 1 }
                            : { key: c.key, dir: 1 },
                        )
                      }
                    >
                      {c.title}
                      {sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                ))}
                {onRowClick && <th aria-hidden="true" />}
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, shown).map((r) => (
                <tr
                  key={rowKey(r)}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-selected={selectedKey === undefined ? undefined : rowKey(r) === selectedKey}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={c.numeric ? 'num' : undefined}>
                      {c.render ? c.render(r) : (c.value(r) ?? '')}
                    </td>
                  ))}
                  {onRowClick && (
                    <td className="ex-table__chevron" aria-hidden="true">
                      <Icon name="chevronRight" size={18} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {hasTotals && (
              <tfoot>
                <tr>
                  {columns.map((c) => (
                    <td key={c.key} className={c.numeric ? 'num' : undefined}>
                      {c.total ? c.total(visible) : ''}
                    </td>
                  ))}
                  {onRowClick && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {visible.length > shown && (
        <p className="ex-muted">
          {shown} / {visible.length}{' '}
          <button
            type="button"
            className="ex-button ex-button--ghost"
            onClick={() => setShown((s) => s + PAGE)}
          >
            +{PAGE}
          </button>
        </p>
      )}
    </div>
  );
}
