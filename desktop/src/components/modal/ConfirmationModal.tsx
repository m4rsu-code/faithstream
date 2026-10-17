import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmationModal({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal((
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    >
      <section role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101d2a] p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-400/10 text-red-300"><AlertTriangle size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="confirmation-title" className="text-base font-bold text-warm-white">{title}</h2>
            <p id="confirmation-message" className="mt-1 text-sm leading-relaxed text-warm-white/60">{message}</p>
          </div>
          <button onClick={onCancel} aria-label="Close confirmation" className="rounded-lg p-1.5 text-warm-white/55 hover:bg-white/10 hover:text-white"><X size={17} /></button>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-warm-white/75 hover:bg-white/5">Cancel</button>
          <button onClick={onConfirm} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-400">{confirmLabel}</button>
        </div>
      </section>
    </div>
  ), document.body);
}
