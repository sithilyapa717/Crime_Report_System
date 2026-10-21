// Sign-in screen (Figma "01 Start + Login"): the four role cards on the left, the login form for
// the chosen role on the right, on one screen. Number keys 1-4 pick a role when no field has focus.
import type { Session } from '@excise/contract';
import { label } from '@excise/labels';
import type { Role } from '@excise/schemas';
import { useEffect, useState } from 'react';
import { START_ROLES } from '../../shell/routes.js';
import { AuthLayout } from './AuthLayout.js';
import { LoginForm } from './LoginScreen.js';

function typingIn(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function StartScreen({ onLoggedIn }: { onLoggedIn: (s: Session) => void }) {
  const [role, setRole] = useState<Role>(START_ROLES[0]!);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || typingIn(e.target)) return;
      const picked = START_ROLES[Number(e.key) - 1];
      if (picked) setRole(picked);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cards = (
    <nav aria-label={label('start.chooseRole')}>
      <ul className="auth-roles">
        {START_ROLES.map((r, i) => (
          <li key={r}>
            <button
              type="button"
              className="auth-role"
              aria-pressed={r === role}
              onClick={() => setRole(r)}
            >
              <span className="auth-role__key" aria-hidden="true">
                {i + 1}
              </span>
              <span className="auth-role__name">{label(`role.${r}`)}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <AuthLayout
      intro={<span className="auth__pill">{label('start.rolePrompt')}</span>}
      panel={
        <>
          <p className="auth__lead">{label('start.intro')}</p>
          {cards}
        </>
      }
    >
      {/* A new form per role: the fields clear and the user name gets focus again. */}
      <LoginForm key={role} role={role} onLoggedIn={onLoggedIn} />
    </AuthLayout>
  );
}
