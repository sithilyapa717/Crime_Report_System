import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

/** A boxed group of fields; `tone` gives the old colours (times orange, cash blue, seized purple). */
export function FormSection({
  title,
  tone,
  action,
  children,
}: {
  title: string;
  tone?: 'times' | 'cash' | 'seized';
  /** A small control in the top right corner of the box (for example a round "+" button). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className={tone ? `ex-section ex-section--${tone}` : 'ex-section'}>
      <legend>{title}</legend>
      {children}
      {/* Last, so the content still follows the legend (it is placed with position: absolute). */}
      {action && <div className="ex-section__action">{action}</div>}
    </fieldset>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="ex-grid">{children}</div>;
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="ex-actions">{children}</div>;
}

export interface TabDef {
  key: string;
  title: string;
  content: ReactNode;
  /** Marks a tab whose fields have errors. */
  invalid?: boolean;
}

/** Tabs with arrow-key navigation (WAI-ARIA tabs pattern). */
export function Tabs({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: TabDef[];
  active?: string;
  onChange?: (key: string) => void;
  label: string;
}) {
  const [own, setOwn] = useState(tabs[0]?.key ?? '');
  const current = active ?? own;
  const listRef = useRef<HTMLDivElement>(null);
  const select = (key: string) => {
    if (key === current) return;
    if (onChange) onChange(key);
    else setOwn(key);
    // Scrolled down a little: glide back so the new tab's content starts at the top.
    const page = document.scrollingElement;
    if (page && page.scrollTop > 0) {
      requestAnimationFrame(() =>
        listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
    }
  };
  const base = useId();
  // One white pill slides from tab to tab. It is moved with the CSSOM, not a style attribute
  // (the app's CSP has no inline styles).
  const indicator = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const place = () => {
    const pill = indicator.current;
    const tab = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!pill || !tab) return;
    pill.style.width = `${tab.offsetWidth}px`;
    pill.style.height = `${tab.offsetHeight}px`;
    pill.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`;
    // The first placement is instant; later ones glide.
    if (!placed.current) {
      placed.current = true;
      requestAnimationFrame(() => pill.classList.add('ex-tabs__indicator--glide'));
    }
  };
  useLayoutEffect(place, [current, tabs.length]);
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(place);
    watch.observe(list);
    list.querySelectorAll('[role="tab"]').forEach((t) => watch.observe(t));
    return () => watch.disconnect();
  }, [tabs.length]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (next === null) return;
    const t = tabs[(next + tabs.length) % tabs.length]!;
    select(t.key);
    document.getElementById(`${base}-${t.key}`)?.focus();
  };
  return (
    <div>
      <div ref={listRef} className="ex-tabs__list" role="tablist" aria-label={label}>
        <span ref={indicator} className="ex-tabs__indicator" aria-hidden="true" />
        {tabs.map((t, i) => (
          <button
            key={t.key}
            id={`${base}-${t.key}`}
            type="button"
            role="tab"
            className="ex-tabs__tab"
            aria-selected={t.key === current}
            data-invalid={t.invalid || undefined}
            aria-controls={`${base}-${t.key}-panel`}
            tabIndex={t.key === current ? 0 : -1}
            onClick={() => select(t.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.title}
            {t.invalid ? ' ⚠' : ''}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.key}
          id={`${base}-${t.key}-panel`}
          role="tabpanel"
          className="ex-tabs__panel"
          aria-labelledby={`${base}-${t.key}`}
          hidden={t.key !== current}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}

/** The white rounded panel the Figma screens are built from (filters, results, form body). */
export function Card({
  title,
  actions,
  className,
  children,
}: {
  title?: ReactNode;
  /** Shown at the right of the title row. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className ? `ex-card ${className}` : 'ex-card'}>
      {(title || actions) && (
        <div className="ex-card__head">
          {title && <h2 className="ex-card__title">{title}</h2>}
          {actions && <div className="ex-card__actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A single choice shown as pills (Figma "Chip"): report scope, person and type. */
export function ChipGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <fieldset className="ex-chips">
      <legend className="ex-chips__label">{label}</legend>
      <div className="ex-chips__list">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="ex-chip"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
