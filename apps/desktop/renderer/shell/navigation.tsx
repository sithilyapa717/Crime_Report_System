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
import { allowed, type Route, type RouteName } from './routes.js';

interface Nav {
  route: Route;
  /** Stack depth, so a screen opened twice with other params is a new screen. */
  depth: number;
  session: Session;
  go: (name: RouteName, params?: Record<string, string>) => void;
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
  const mayLeave = () => {
    if (!guard.current?.()) return true;
    if (!window.confirm(label('cr.unsaved'))) return false;
    guard.current = null;
    return true;
  };
  const nav = useMemo<Nav>(
    () => ({
      route: stack[stack.length - 1]!,
      depth: stack.length,
      session,
      go: (name, params) => {
        if (!allowed(session.role, name) || !mayLeave()) return;
        setStack((s) => [...s, { name, ...(params ? { params } : {}) }]);
      },
      replace: (name, params) => {
        if (!allowed(session.role, name)) return;
        guard.current = null;
        setStack((s) => [...s.slice(0, -1), { name, ...(params ? { params } : {}) }]);
      },
      back: () => mayLeave() && setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      home: () => mayLeave() && setStack([{ name: 'home' }]),
      setLeaveGuard: (dirty) => {
        guard.current = dirty;
      },
    }),
    [stack, session],
  );
  return <NavContext.Provider value={nav}>{children}</NavContext.Provider>;
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
