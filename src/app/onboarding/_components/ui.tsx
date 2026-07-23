"use client";

import { cn } from "@/lib/cn";

// ─────────────────────────────────────────────────────────────────────────
//  Shared onboarding form primitives — styled to match the pickabots dark
//  glassmorphic look (orange #FF6B00 accent). Ported in spirit from the
//  sumobots Input/Select/Button components but re-themed for this app.
// ─────────────────────────────────────────────────────────────────────────

const ORANGE = "#FF6B00";

export type Option = { value: string; label: string };

export function FieldLabel({
  label,
  required,
}: {
  label: string;
  required?: boolean;
}) {
  return (
    <span className="text-sm text-foreground/70">
      {label}
      {required && <span className="text-[#FF6B00]"> *</span>}
    </span>
  );
}

export function TextField({
  label,
  name,
  error,
  required,
  ...props
}: {
  label: string;
  error?: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel label={label} required={required} />
      <input
        name={name}
        className={cn(
          "min-h-[44px] rounded-lg border bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/30 focus:border-[#FF6B00]/60",
          error ? "border-red-400/60" : "border-white/10",
        )}
        {...props}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
}

export function SelectField({
  label,
  name,
  options,
  placeholder,
  error,
  required,
  ...props
}: {
  label: string;
  options: Option[];
  placeholder?: string;
  error?: string;
  required?: boolean;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel label={label} required={required} />
      <select
        name={name}
        className={cn(
          "min-h-[44px] rounded-lg border bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-[#FF6B00]/60",
          error ? "border-red-400/60" : "border-white/10",
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#0d1018]">
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
}

export function RadioGroup({
  label,
  name,
  options,
  value,
  onChange,
  error,
  required,
}: {
  label: string;
  name: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} required={required} />
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <label
              key={opt.value}
              className={cn(
                "flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                active
                  ? "border-[#FF6B00]/70 bg-[#FF6B00]/10 text-foreground"
                  : "border-white/10 bg-white/5 text-foreground/60 hover:border-[#FF6B00]/30 hover:bg-white/10",
              )}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={active}
                onChange={() => onChange(opt.value)}
                className="h-4 w-4 accent-[#FF6B00]"
              />
              {opt.label}
            </label>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
  error,
  required,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  error?: string;
  required?: boolean;
}) {
  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} required={required} />
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={cn(
                "flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                active
                  ? "border-[#FF6B00]/70 bg-[#FF6B00]/10 text-foreground"
                  : "border-white/10 bg-white/5 text-foreground/60 hover:border-[#FF6B00]/30 hover:bg-white/10",
              )}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(opt.value)}
                className="h-4 w-4 rounded accent-[#FF6B00]"
              />
              {opt.label}
            </label>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function YesNoToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
        value
          ? "border-[#FF6B00]/70 bg-[#FF6B00]/10 text-foreground"
          : "border-white/10 bg-white/5 text-foreground/60 hover:border-[#FF6B00]/30 hover:bg-white/10",
      )}
    >
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 rounded accent-[#FF6B00]"
      />
      {label}
    </label>
  );
}

export function PrimaryButton({
  loading,
  disabled,
  children,
  className,
  type = "button",
  ...props
}: {
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[#FF6B00]/40 bg-[#FF6B00]/15 px-4 py-3 text-sm font-medium uppercase tracking-widest text-[#FF6B00] transition-colors hover:bg-[#FF6B00]/25 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      style={{ boxShadow: "0 0 32px rgba(255,107,0,0.12)" }}
      {...props}
      disabled={loading || disabled}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-[#FF6B00]/40 border-t-[#FF6B00]"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "flex min-h-[44px] w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-foreground/70 transition-colors hover:border-white/30 hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Large tappable card used for user-type / option selection. */
export function OptionCard({
  title,
  description,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-xl border p-5 text-center backdrop-blur-sm transition-colors",
        disabled
          ? "cursor-not-allowed border-white/5 bg-white/[0.02] text-foreground/30"
          : "border-white/10 bg-white/5 text-foreground hover:border-[#FF6B00]/60 hover:bg-white/10",
      )}
    >
      <span className="font-display text-lg" style={{ color: disabled ? undefined : ORANGE }}>
        {title}
      </span>
      <span className="text-sm text-foreground/50">{description}</span>
    </button>
  );
}

/** Branded PICKABOTS header + subtitle chip, matching the standby screen. */
export function BrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        style={{
          fontFamily: "var(--font-audiowide)",
          fontSize: "1.7rem",
          color: ORANGE,
          letterSpacing: 6,
          textTransform: "uppercase",
          textShadow: "0 0 32px rgba(255,107,0,0.45)",
        }}
      >
        PICKABOTS
      </div>
      <div
        className="mt-2 inline-block rounded-md px-3 py-1"
        style={{ background: "rgba(255,107,0,0.3)" }}
      >
        <span className="text-[0.5rem] font-black uppercase tracking-[0.4em] text-white">
          {subtitle}
        </span>
      </div>
    </div>
  );
}
