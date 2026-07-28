"use client";

import { cn } from "@/lib/cn";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Extra controls between the message and the buttons (e.g. an option picker). */
  children?: React.ReactNode;
  /** Roomier panel, for when `children` needs more than a sentence of width. */
  wide?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', children, wide = false, onConfirm, onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={cn("glass-strong mx-4 w-full rounded-2xl p-6", wide ? "max-w-md" : "max-w-sm")}>
        <h2 className="mb-2 text-sm font-semibold text-foreground">{title}</h2>
        <p className={cn("text-xs text-foreground/60", children ? "mb-4" : "mb-6")}>{message}</p>
        {children}
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
