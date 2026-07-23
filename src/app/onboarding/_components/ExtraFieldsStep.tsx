"use client";

import { useState } from "react";
import { PrimaryButton, SelectField, TextField, YesNoToggle } from "./ui";
import {
  EXTRA_FIELDS,
  validateExtra,
  type ExtraAnswers,
} from "./extraFields";

// ─────────────────────────────────────────────────────────────────────────
//  Final onboarding step for pickabots-specific questions. Fully config-
//  driven off EXTRA_FIELDS — add/remove fields there and this renders them.
// ─────────────────────────────────────────────────────────────────────────

export default function ExtraFieldsStep({
  initial,
  submitLabel,
  onComplete,
}: {
  initial: ExtraAnswers;
  submitLabel?: string;
  onComplete: (answers: ExtraAnswers) => void;
}) {
  const [values, setValues] = useState<ExtraAnswers>(initial);
  const [error, setError] = useState<string | null>(null);

  function setField(id: string, value: string | boolean) {
    setValues((prev) => ({ ...prev, [id]: value }));
  }

  function handleSubmit() {
    const err = validateExtra(values);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onComplete(values);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-2xl">Almost done</h2>
        <p className="mt-1 text-sm text-foreground/60">
          A couple of pickabots-specific questions.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {EXTRA_FIELDS.map((field) => {
          if (field.type === "text") {
            const value = typeof values[field.id] === "string" ? (values[field.id] as string) : "";
            return (
              <TextField
                key={field.id}
                label={field.label}
                required={field.required}
                placeholder={field.placeholder}
                value={value}
                onChange={(e) => setField(field.id, e.target.value)}
              />
            );
          }

          if (field.type === "select") {
            const value = typeof values[field.id] === "string" ? (values[field.id] as string) : "";
            return (
              <SelectField
                key={field.id}
                label={field.label}
                required={field.required}
                placeholder={field.placeholder ?? "Select…"}
                options={field.options ?? []}
                value={value}
                onChange={(e) => setField(field.id, e.target.value)}
              />
            );
          }

          // checkbox
          const checked = values[field.id] === true;
          return (
            <YesNoToggle
              key={field.id}
              label={field.label}
              value={checked}
              onChange={(next) => setField(field.id, next)}
            />
          );
        })}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <PrimaryButton onClick={handleSubmit}>{submitLabel ?? "Continue"}</PrimaryButton>
    </div>
  );
}
