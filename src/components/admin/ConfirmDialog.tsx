"use client";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-strong mx-4 max-w-sm w-full rounded-2xl p-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">{title}</h2>
        <p className="mb-6 text-xs text-foreground/60">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-white/20 bg-white/5 px-4 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-white/10"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg border border-red-400/40 bg-red-400/15 px-4 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-400/25"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
