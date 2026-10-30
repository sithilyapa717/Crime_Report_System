// Date and time pickers that follow the theme (the system pickers cannot be styled). They open as
// a popover in the browser's top layer, under the field's clock or calendar button, so no box or
// section on the page can cover them. Staff can still type the value; these are for choosing.
import { label } from '@excise/labels';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons.js';

const pad = (n: number) => String(n).padStart(2, '0');

/** A popover under `anchor`: right-aligned with it, above it when there is no room below. */
function Popover({
  anchor,
  onClose,
  className,
  children,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !anchor) return;
    el.showPopover?.();
    const a = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(a.right - w, window.innerWidth - w - 8));
    const below = a.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, a.top - h - 6) : below;
    el.style.setProperty('left', `${left}px`);
    el.style.setProperty('top', `${top}px`);
    return () => {
      try {
        el.hidePopover?.();
      } catch {
        // already closed
      }
    };
  }, [anchor]);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !anchor?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [anchor, onClose]);
  return (
    <div
      ref={box}
      popover="manual"
      className={className ? `ex-popover ${className}` : 'ex-popover'}
    >
      {children}
    </div>
  );
}

const parseIso = (iso: string | undefined) => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
};

const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat('si-LK', { weekday: 'narrow' }).format(new Date(2021, 0, 3 + i)),
);

const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A month of days to click, with month and year arrows, "Clear" and "Today". */
export function DatePopover({
  anchor,
  value,
  onPick,
  onClose,
}: {
  anchor: HTMLElement | null;
  /** ISO date (`2026-10-30`) or undefined. */
  value: string | undefined;
  onPick: (iso: string | undefined) => void;
  onClose: () => void;
}) {
  const now = new Date();
  const todayIso = isoOf(now);
  const chosen = parseIso(value);
  const [view, setView] = useState({
    y: chosen?.y ?? now.getFullYear(),
    m: chosen?.m ?? now.getMonth(),
  });
  const step = (months: number) =>
    setView((v) => {
      const t = v.y * 12 + v.m + months;
      return { y: Math.floor(t / 12), m: t % 12 };
    });
  const lead = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const pick = (iso: string | undefined) => {
    onPick(iso);
    onClose();
  };
  const nav = (months: number, name: string, icon: 'chevronLeft' | 'chevronRight') => (
    <button
      type="button"
      className="ex-cal__nav"
      aria-label={label(name)}
      title={label(name)}
      onClick={() => step(months)}
    >
      <Icon name={icon} size={16} />
    </button>
  );
  return (
    <Popover anchor={anchor} onClose={onClose} className="ex-cal">
      <div className="ex-cal__head">
        {nav(-12, 'picker.prevYear', 'chevronLeft')}
        {nav(-1, 'picker.prevMonth', 'chevronLeft')}
        <span className="ex-cal__title" aria-live="polite">
          {label(`month.${view.m + 1}`)} {view.y}
        </span>
        {nav(1, 'picker.nextMonth', 'chevronRight')}
        {nav(12, 'picker.nextYear', 'chevronRight')}
      </div>
      <div className="ex-cal__grid" role="grid">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="ex-cal__weekday">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`b${i}`} />;
          const iso = `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
          return (
            <button
              key={d}
              type="button"
              className="ex-cal__day"
              aria-pressed={iso === value}
              data-today={iso === todayIso || undefined}
              onClick={() => pick(iso)}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="ex-cal__foot">
        <button type="button" className="ex-cal__link" onClick={() => pick(undefined)}>
          {label('picker.clear')}
        </button>
        <button type="button" className="ex-cal__link" onClick={() => pick(todayIso)}>
          {label('picker.today')}
        </button>
      </div>
    </Popover>
  );
}

/** `14.45` / `14:45` → hour and minute; anything else → nothing chosen. */
export function parseTime(text: string): { h: number; m: number } | null {
  const m = /^\s*(\d{1,2})[.:](\d{2})\s*$/.exec(text);
  return m && Number(m[1]) <= 23 && Number(m[2]) <= 59
    ? { h: Number(m[1]), m: Number(m[2]) }
    : null;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

/** Two columns, hours and minutes (24-hour, as the times are written), "Clear" and "Now". */
export function TimePopover({
  anchor,
  value,
  onPick,
  onClose,
}: {
  anchor: HTMLElement | null;
  /** The time as typed (`14.45`). */
  value: string;
  onPick: (time: string) => void;
  onClose: () => void;
}) {
  const t = parseTime(value);
  const make = (h: number, m: number) => `${pad(h)}.${pad(m)}`;
  const column = (
    name: string,
    items: number[],
    current: number | undefined,
    set: (n: number) => void,
  ) => (
    <div className="ex-time__col" role="listbox" aria-label={label(name)}>
      {items.map((n) => (
        <button
          key={n}
          type="button"
          role="option"
          aria-selected={n === current}
          className="ex-time__item"
          ref={(el) => {
            if (el && n === current) el.scrollIntoView({ block: 'center' });
          }}
          onClick={() => set(n)}
        >
          {pad(n)}
        </button>
      ))}
    </div>
  );
  return (
    <Popover anchor={anchor} onClose={onClose} className="ex-time">
      <div className="ex-time__cols">
        {column('picker.hour', HOURS, t?.h, (h) => onPick(make(h, t?.m ?? 0)))}
        {column('picker.minute', MINUTES, t?.m, (m) => onPick(make(t?.h ?? 0, m)))}
      </div>
      <div className="ex-cal__foot">
        <button
          type="button"
          className="ex-cal__link"
          onClick={() => {
            onPick('');
            onClose();
          }}
        >
          {label('picker.clear')}
        </button>
        <button
          type="button"
          className="ex-cal__link"
          onClick={() => {
            const d = new Date();
            onPick(make(d.getHours(), d.getMinutes()));
            onClose();
          }}
        >
          {label('picker.now')}
        </button>
        <button type="button" className="ex-cal__link ex-cal__link--done" onClick={onClose}>
          {label('picker.done')}
        </button>
      </div>
    </Popover>
  );
}
