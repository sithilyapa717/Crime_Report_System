import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';

/** A boxed group of fields; `tone` gives the old colours (times orange, cash blue, seized purple). */
export function FormSection({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: 'times' | 'cash' | 'seized';
  children: ReactNode;
}) {
  return (
    <fieldset className={tone ? `ex-section ex-section--${tone}` : 'ex-section'}>
      <legend>{title}</legend>
      {children}
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
  const select = (key: string) => (onChange ? onChange(key) : setOwn(key));
  const base = useId();
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (next === null) return;
    const t = tabs[(next + tabs.length) % tabs.length]!;
    select(t.key);
    document.getElementById(`${base}-${t.key}`)?.focus();
  };
  return (
    <div>
      <div className="ex-tabs__list" role="tablist" aria-label={label}>
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
