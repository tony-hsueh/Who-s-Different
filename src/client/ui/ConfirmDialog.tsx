import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';
import './ConfirmDialog.css';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  // Locks the confirm button while the request it triggers is in flight.
  confirmDisabled?: boolean;
  // Enter confirms wherever focus is. Off by default, so Enter on the focused cancel button just cancels.
  confirmOnEnter?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '確定',
  cancelLabel = '取消',
  danger = false,
  confirmDisabled = false,
  confirmOnEnter = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Read through a ref so a parent's inline callback does not restart the focus handling.
  const onCancelRef = useRef(onCancel);
  const enterRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    onCancelRef.current = onCancel;
    enterRef.current = confirmOnEnter && !confirmDisabled ? onConfirm : null;
  });

  useEffect(() => {
    if (!open) return;
    // Focus the harmless choice first so a stray Enter does not confirm.
    const opener = document.activeElement;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancelRef.current();
        return;
      }
      if (event.key === 'Enter') {
        // A held key repeats; the keypress that opened the dialog must not confirm it.
        if (event.repeat || !enterRef.current) return;
        event.preventDefault();
        enterRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      // Keep Tab inside the dialog so the page behind it cannot be reached.
      const buttons = [
        ...(dialogRef.current?.querySelectorAll('button') ?? []),
      ];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const active = document.activeElement;
      if (!first || !last) return;
      if (!buttons.some((b) => b === active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="wd-dialog__backdrop">
      <div
        ref={dialogRef}
        className="wd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>{title}</h2>
        {message && <p>{message}</p>}
        <div className="wd-dialog__actions">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
