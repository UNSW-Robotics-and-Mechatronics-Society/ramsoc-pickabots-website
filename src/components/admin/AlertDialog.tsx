"use client";

/**
 * Single-button modal for telling the admin an action couldn't run — the
 * counterpart to ConfirmDialog (which asks before a destructive action).
 * There's nothing to confirm here, so there's only a dismiss button.
 */
type Props = {
  title: string;
  message: string;
  dismissLabel?: string;
  onDismiss: () => void;
};

export default function AlertDialog({ title, message, dismissLabel = 'OK', onDismiss }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-strong mx-4 max-w-sm w-full rounded-2xl p-6">
        <h2 className="mb-2 text-sm font-semibold text-red-300">{title}</h2>
        <p className="mb-6 text-xs text-foreground/60">{message}</p>
        <div className="flex justify-end">
          <button
            onClick={onDismiss}
            className="rounded-lg border border-white/20 bg-white/5 px-4 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-white/10"
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
