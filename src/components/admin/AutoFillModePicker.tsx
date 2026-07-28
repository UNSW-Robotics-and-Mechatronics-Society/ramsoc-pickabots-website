"use client";

import { cn } from "@/lib/cn";
import type { AutoFillMode } from "@/lib/seeds";

/**
 * The Round 1 layout choice shown inside the Auto Fill confirm dialogs. Lives in
 * its own file because both entry points (the bracket's Auto Fill button and the
 * Settings panel's post-import prompt) offer the same choice and must describe it
 * identically — the mode is picked per run, so nothing here is persisted.
 */

const OPTIONS: { mode: AutoFillMode; label: string; hint: string }[] = [
  {
    mode: 'worst-plays-best',
    label: 'Worst plays Best',
    hint: 'Standard seeding: seed 1 draws the weakest team and the top two seeds can only meet in the final. Top seeds play their first match last.',
  },
  {
    mode: 'worst-plays-first',
    label: 'Worst plays First',
    hint: 'Seeds run top to bottom: the two weakest teams play the first match, seeds 1 and 2 the last of Round 1. Every round plays top to bottom.',
  },
];

type Props = {
  value: AutoFillMode;
  onChange: (mode: AutoFillMode) => void;
};

export default function AutoFillModePicker({ value, onChange }: Props) {
  return (
    <fieldset className="mb-5 space-y-2">
      <legend className="mb-2 text-[0.6rem] font-medium uppercase tracking-wide text-foreground/40">
        Round 1 layout
      </legend>
      {OPTIONS.map(opt => (
        <label
          key={opt.mode}
          className={cn(
            "flex cursor-pointer gap-2.5 rounded-lg border p-2.5 transition-colors",
            value === opt.mode
              ? "border-white/30 bg-white/10"
              : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
          )}
        >
          <input
            type="radio"
            name="autofill-mode"
            value={opt.mode}
            checked={value === opt.mode}
            onChange={() => onChange(opt.mode)}
            className="mt-0.5 shrink-0 accent-white/70"
          />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-foreground">{opt.label}</span>
            <span className="mt-0.5 block text-[0.65rem] leading-snug text-foreground/50">{opt.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
