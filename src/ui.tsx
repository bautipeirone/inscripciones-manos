import { status, statusLabels, type Event } from './domain';
import { useEffect, useRef, useId, type ReactNode } from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import { ConvexError } from 'convex/values';
export function errorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === 'string')
    return error.data;
  if (error instanceof Error && !error.message.includes('[CONVEX'))
    return error.message;
  return 'No pudimos completar la acción. Revisá tu conexión e intentá de nuevo.';
}
export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Manos a la Obra, inicio">
      <img
        src="/logo.svg"
        alt="Manos a la Obra Rosario"
        width="48"
        height="48"
      />
      <span>Manos a la Obra</span>
    </a>
  );
}
export function Arrow() {
  return <ArrowUpRight size={19} aria-hidden="true" />;
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar ventana"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function Status({ event, now }: { event: Event; now?: number }) {
  const value = status(event, now);
  return (
    <span className={`status status-${value}`}>
      <i />
      {statusLabels[value]}
    </span>
  );
}
