// ─────────────────────────────────────────────────────────────────────────
//  PICKABOTS-SPECIFIC onboarding questions.
//
//  Add / remove / reorder questions here and NOTHING ELSE needs to change —
//  no migration. Answers are stored as JSON in `users.onboarding_extra`
//  (see migration 0005) and shown on the admin Players page.
//
//  Use this ONLY for pickabots-only questions. Fields that must be shared with
//  the sumobots site (name, zID, degree, phone, …) belong in the typed
//  `profiles` columns via the main details form, not here.
//
//  To disable the extra-questions step entirely, set EXTRA_FIELDS = [].
// ─────────────────────────────────────────────────────────────────────────

export type ExtraFieldType = "text" | "select" | "checkbox";

export type ExtraField = {
  /** Stable key used as the JSON key in users.onboarding_extra. */
  id: string;
  label: string;
  type: ExtraFieldType;
  required?: boolean;
  placeholder?: string;
  /** Options for `select` fields. */
  options?: { value: string; label: string }[];
};

export type ExtraAnswers = Record<string, string | boolean>;

export const EXTRA_FIELDS: ExtraField[] = [
  // ── EXAMPLE (safe to delete) ──────────────────────────────────────────────
  {
    id: "shirt_size",
    label: "T-shirt size (for competitor swag)",
    type: "select",
    required: false,
    options: [
      { value: "XS", label: "XS" },
      { value: "S", label: "S" },
      { value: "M", label: "M" },
      { value: "L", label: "L" },
      { value: "XL", label: "XL" },
      { value: "2XL", label: "2XL" },
    ],
  },
];

/** Default answer object for the configured fields. */
export function defaultExtraAnswers(): ExtraAnswers {
  const out: ExtraAnswers = {};
  for (const f of EXTRA_FIELDS) out[f.id] = f.type === "checkbox" ? false : "";
  return out;
}

/** Returns the first validation error message, or null when all required fields are answered. */
export function validateExtra(values: ExtraAnswers): string | null {
  for (const f of EXTRA_FIELDS) {
    if (!f.required) continue;
    const v = values[f.id];
    if (f.type === "checkbox") {
      if (v !== true) return `${f.label} is required`;
    } else if (typeof v !== "string" || !v.trim()) {
      return `${f.label} is required`;
    }
  }
  return null;
}
