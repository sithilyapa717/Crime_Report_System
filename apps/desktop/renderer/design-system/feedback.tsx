import { label } from '@excise/labels';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from './buttons.js';

export function Spinner({ label: text = label('common.loading') }: { label?: string }) {
  return (
    <span role="status" className="ex-check">
      <span className="ex-spinner" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}

export function Alert({ kind, children }: { kind: 'error' | 'ok' | 'warn'; children: ReactNode }) {
  return (
    <div className={`ex-alert ex-alert--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Badge({
  kind,
  children,
}: {
  kind?: 'warn' | 'danger' | 'ok';
  children: ReactNode;
}) {
  return <span className={kind ? `ex-badge ex-badge--${kind}` : 'ex-badge'}>{children}</span>;
}

export function EmptyState({ children = label('common.empty') }: { children?: ReactNode }) {
  return <div className="ex-empty">{children}</div>;
}

/** Modal dialog on the native <dialog> element (focus trap and Escape for free). */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={wide ? 'ex-dialog ex-dialog--wide' : 'ex-dialog'}
      aria-label={title}
      onClose={onClose}
      onCancel={onClose}
    >
      {open && (
        <div className="ex-dialog__body">
          <h2>{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Shown when a save the application accepted is then rejected by the database. */
export function SaveFailedDialog({
  open,
  detail,
  onClose,
}: {
  open: boolean;
  detail: string;
  onClose: () => void;
}) {
  const [explanation, raw] = detail.split('\n');
  return (
    <Dialog open={open} onClose={onClose} title={label('error.saveFailed')}>
      <p>{label('error.saveFailedBody')}</p>
      {explanation ? <p>{explanation}</p> : null}
      {raw ? <p>{raw}</p> : null}
      <div className="ex-actions">
        <Button variant="primary" onClick={onClose}>
          {label('common.ok')}
        </Button>
      </div>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = label('common.yes'),
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <p>{message}</p>
      <div className="ex-actions">
        <Button onClick={onCancel}>{label('common.no')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

const ToastContext = createContext<(text: string, kind?: Toast['kind']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      kind === 'error' ? 8000 : 4000,
    );
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="ex-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={t.kind === 'error' ? 'ex-toast ex-toast--error' : 'ex-toast'}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
