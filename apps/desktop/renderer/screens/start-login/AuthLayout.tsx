// The one layout for everything before the main menu (sign in, first run, password change), from
// the Figma frame "01 Start + Login": a gradient panel with the department name on the left, the
// form on the right. `panel` adds content under the department name (the role cards).
import { label } from '@excise/labels';
import type { ReactNode } from 'react';
import './start-login.css';

export function AuthLayout({
  intro,
  panel,
  children,
}: {
  intro?: ReactNode;
  panel?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="auth">
      <div className="auth__shell">
        <header className="auth__panel">
          <div className="auth__brand">
            <span className="auth__mark" aria-hidden="true">
              ස
            </span>
            <span>{label('start.subtitle')}</span>
          </div>
          <div className="auth__panel-body">
            <div className="auth__intro">
              {intro}
              <p className="auth__dept">{label('start.title')}</p>
            </div>
            {panel}
          </div>
        </header>
        <main className="auth__work">
          <div className="auth__form">{children}</div>
        </main>
      </div>
    </div>
  );
}
