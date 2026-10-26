import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** `edit`, `warn` and `ok` colour row actions: rename/edit blue, deactivate amber, activate green. */
type Variant = 'default' | 'primary' | 'danger' | 'ghost' | 'edit' | 'warn' | 'ok';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  busy?: boolean;
}

/** A button. Long captions wrap rather than being cut off. */
export function Button({
  variant = 'default',
  busy,
  disabled,
  className,
  children,
  type,
  ...rest
}: ButtonProps) {
  const cls = ['ex-button', variant !== 'default' && `ex-button--${variant}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type ?? 'button'}
      className={cls}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <span className="ex-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** The big menu buttons staff know from the old main menu (and the yellow role buttons). */
export function BigMenuButton({
  yellow,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { yellow?: boolean; children: ReactNode }) {
  const cls = ['ex-menu-button', yellow && 'ex-menu-button--role', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

export function MenuGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <nav className="ex-menu-grid" aria-label={label}>
      {children}
    </nav>
  );
}
