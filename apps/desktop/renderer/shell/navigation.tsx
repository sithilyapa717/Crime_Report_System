// A small stack router: screens push and pop; no URLs (the app is one window, no history bar).
// A screen with unsaved changes registers a guard; leaving it then asks first.
import type { Session } from '@excise/contract';
import { label } from '@excise/labels';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { ConfirmDialog } from '../design-system/index.js';
import { allowed, type Route, type RouteName } from './routes.js';

interface Nav {
  route: Route;
  /** Stack depth, so a screen opened twice with other params is a new screen. */
  depth: number;
  session: Session;
  go: (name: RouteName, params?: Record<string, string>) => void;
  /** Opens a menu screen from the sidebar: the stack becomes main menu → that screen, so Back
   *  returns to the main menu instead of through every screen visited before. */
  open: (name: RouteName) => void;
  /** Replaces the current screen (e.g. after creating a CR, show it under its id). */
  replace: (name: RouteName, params?: Record<string, string>) => void;
  back: () => void;
  home: () => void;
  /** `dirty()` true → leaving asks for confirmation. Pass null to remove. */
  setLeaveGuard: (dirty: (() => boolean) | null) => void;
}

const NavContext = createContext<Nav | null>(null);

export function NavigationProvider({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const guard = useRef<(() => boolean) | null>(null);
  /** Make a screen change. The browser fades the old screen out and the new one in (see the
   *  `::view-transition` rules in styles.css); where that is not available, it just changes. */
  const swap = (change: () => void) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof document.startViewTransition !== 'function') return change();
    document.startViewTransition(() => flushSync(change));
  };
  // Unsaved changes: the app's own dialog asks first (a native confirm() box looks out of place).
  const [asking, setAsking] = useState<(() => void) | null>(null);
  const leaveThen = (action: () => void) => {
    if (!guard.current?.()) return action();
    setAsking(() => action);
  };
  const nav = useMemo<Nav>(
    () => ({
      route: stack[stack.length - 1]!,
      depth: stack.length,
      session,
      go: (name, params) => {
        if (!allowed(session.role, name)) return;
        leaveThen(() =>
          swap(() => setStack((s) => [...s, { name, ...(params ? { params } : {}) }])),
        );
      },
      open: (name) => {
        if (!allowed(session.role, name)) return;
        leaveThen(() => swap(() => setStack([{ name: 'home' }, { name }])));
      },
      replace: (name, params) => {
        if (!allowed(session.role, name)) return;
        guard.current = null;
        setStack((s) => [...s.slice(0, -1), { name, ...(params ? { params } : {}) }]);
      },
      back: () => leaveThen(() => swap(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)))),
      home: () => leaveThen(() => swap(() => setStack([{ name: 'home' }]))),
      setLeaveGuard: (dirty) => {
        guard.current = dirty;
      },
    }),
    [stack, session],
  );
  return (
    <NavContext.Provider value={nav}>
      {children}
      <ConfirmDialog
        open={asking !== null}
        title={label('leave.title')}
        message={label('leave.message')}
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          const action = asking;
          setAsking(null);
          guard.current = null;
          action?.();
        }}
      />
    </NavContext.Provider>
  );
}

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav outside NavigationProvider');
  return nav;
}

/** Registers "unsaved changes?" for the current screen while it is shown. */
export function useLeaveGuard(dirty: boolean): void {
  const { setLeaveGuard } = useNav();
  const ref = useRef(dirty);
  ref.current = dirty;
  useEffect(() => {
    setLeaveGuard(() => ref.current);
    return () => setLeaveGuard(null);
  }, [setLeaveGuard]);
}
