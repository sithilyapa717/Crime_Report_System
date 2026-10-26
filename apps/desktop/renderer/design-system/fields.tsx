// Form fields. Every field has a visible label (the old pink/blue tag), an error line and an id
// linking them, so screen readers and keyboard users get the same information.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { label as caption } from '@excise/labels';
import { formatDate, parseDateInput } from './dates.js';
import { Icon } from './icons.js';

interface FieldFrame {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  tag?: 'blue' | 'pink';
}

function Field({
  label,
  error,
  hint,
  tag = 'blue',
  id,
  children,
}: FieldFrame & { id: string; children: ReactNode }) {
  return (
    <div className="ex-field">
      <label
        htmlFor={id}
        className={tag === 'pink' ? 'ex-field__label ex-field__label--pink' : 'ex-field__label'}
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <span id={`${id}-hint`} className="ex-field__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="ex-field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function aria(id: string, error?: string, hint?: string) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

type InputBase = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & FieldFrame;

export function TextField({
  value,
  onChange,
  label,
  error,
  hint,
  tag,
  ...rest
}: InputBase & { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} hint={hint} tag={tag}>
      <input
        id={id}
        className="ex-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...aria(id, error, hint)}
        {...rest}
      />
    </Field>
  );
}

export function PasswordField(props: InputBase & { value: string; onChange: (v: string) => void }) {
  return <TextField type="password" autoComplete="off" {...props} />;
}

export function TextArea({
  value,
  onChange,
  label,
  error,
  hint,
  tag,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> &
  FieldFrame & { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} hint={hint} tag={tag}>
      <textarea
        id={id}
        className="ex-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...aria(id, error, hint)}
        {...rest}
      />
    </Field>
  );
}

/** Whole or decimal number; empty means "no value" (undefined). */
export function NumberField({
  value,
  onChange,
  label,
  error,
  hint,
  tag,
  decimals = false,
  ...rest
}: InputBase & {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  decimals?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    setText((t) =>
      Number(t) === value || (t === '' && value === undefined)
        ? t
        : value === undefined
          ? ''
          : String(value),
    );
  }, [value]);
  const bad = text !== '' && !(decimals ? /^\d+(\.\d+)?$/ : /^\d+$/).test(text.trim());
  return (
    <Field
      id={id}
      label={label}
      error={error ?? (bad ? caption('error.invalid_type') : undefined)}
      hint={hint}
      tag={tag}
    >
      <input
        id={id}
        className="ex-input ex-input--number"
        inputMode={decimals ? 'decimal' : 'numeric'}
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const ok = (decimals ? /^\d+(\.\d+)?$/ : /^\d+$/).test(t.trim());
          onChange(t.trim() === '' ? undefined : ok ? Number(t) : value);
        }}
        {...aria(id, error ?? (bad ? 'x' : undefined), hint)}
        {...rest}
      />
    </Field>
  );
}

/** Shows and accepts `YYYY.MM.DD`; the value is ISO (`YYYY-MM-DD`) or undefined. The calendar
 *  button opens the system date picker, for staff who would rather choose than type. */
export function DateField({
  value,
  onChange,
  label,
  error,
  hint,
  tag,
  ...rest
}: InputBase & { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const id = useId();
  const picker = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(formatDate(value));
  useEffect(() => {
    setText((t) => (parseDateInput(t) === (value ?? null) ? t : formatDate(value)));
  }, [value]);
  const bad = text.trim() !== '' && parseDateInput(text) === null;
  return (
    <Field
      id={id}
      label={label}
      error={error ?? (bad ? caption('error.invalid_string') : undefined)}
      hint={hint}
      tag={tag}
    >
      <div className="ex-date">
        <input
          id={id}
          className="ex-input"
          placeholder="YYYY.MM.DD"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const iso = parseDateInput(e.target.value);
            if (e.target.value.trim() === '') onChange(undefined);
            else if (iso) onChange(iso);
          }}
          onBlur={() => {
            const iso = parseDateInput(text);
            if (iso) setText(formatDate(iso));
          }}
          {...aria(id, error ?? (bad ? 'x' : undefined), hint)}
          {...rest}
        />
        <button
          type="button"
          className="ex-date__button"
          aria-label={`${label}: ${caption('date.pick')}`}
          title={caption('date.pick')}
          disabled={rest.disabled}
          onClick={() => picker.current?.showPicker?.()}
        >
          <Icon name="calendar" size={18} />
        </button>
        <input
          ref={picker}
          type="date"
          className="ex-date__picker"
          tabIndex={-1}
          aria-hidden="true"
          value={parseDateInput(text) ?? ''}
          onChange={(e) => {
            const iso = e.target.value || undefined;
            setText(formatDate(iso));
            onChange(iso);
          }}
        />
      </div>
    </Field>
  );
}

/** Free text kept as typed (times such as 14.45 or 14:45). */
export function TimeField(props: InputBase & { value: string; onChange: (v: string) => void }) {
  return <TextField inputMode="numeric" placeholder="14.45" {...props} />;
}

export interface Option {
  value: string;
  label: string;
  /** Shown but not choosable (an inactive list item still used by this record). */
  disabled?: boolean;
}

/** Drop-down with a type-to-filter box when the list is long. */
export function Select({
  value,
  onChange,
  options,
  label,
  error,
  hint,
  tag,
  placeholder = '—',
  searchable,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> &
  FieldFrame & {
    value: string | undefined;
    onChange: (v: string | undefined) => void;
    options: Option[];
    placeholder?: string;
    searchable?: boolean;
  }) {
  const id = useId();
  const [filter, setFilter] = useState('');
  const showFilter = searchable ?? options.length > 12;
  const shown = filter
    ? options.filter(
        (o) => o.value === value || o.label.toLowerCase().includes(filter.toLowerCase()),
      )
    : options;
  return (
    <Field id={id} label={label} error={error} hint={hint} tag={tag}>
      {showFilter && (
        <input
          className="ex-input"
          aria-label={`${label}: ${caption('common.filter')}`}
          placeholder="…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      <select
        id={id}
        className="ex-select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        {...aria(id, error, hint)}
        {...rest}
      >
        <option value="">{placeholder}</option>
        {shown.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'checked' | 'onChange' | 'type'> & {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="ex-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}

export function RadioGroup<T extends string>({
  value,
  onChange,
  options,
  label,
  name,
}: {
  value: T | undefined;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  name: string;
}) {
  return (
    <fieldset className="ex-radio-group">
      <legend className="ex-field__label">{label}</legend>
      {options.map((o) => (
        <label key={o.value} className="ex-check">
          <input
            type="radio"
            name={name}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
