"use client";

import { useActionState } from "react";
import { submitAdminKey, type AdminKeyState } from "@/app/admin/actions";

const initialState: AdminKeyState = { error: null };

export default function AdminKeyForm() {
  const [state, formAction, pending] = useActionState(submitAdminKey, initialState);

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <form action={formAction} className="glass flex w-full max-w-xs flex-col gap-3 rounded-2xl p-6">
        <h1 className="text-center text-lg font-semibold">Admin Access</h1>
        <p className="text-center text-sm text-foreground/60">
          Enter the admin key to access this page.
        </p>
        <input
          type="password"
          name="key"
          required
          autoFocus
          placeholder="Admin key"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30"
        />
        {state.error && (
          <p className="text-center text-xs text-red-400">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-medium transition-colors hover:bg-white/15 disabled:opacity-50"
        >
          {pending ? "Checking…" : "Enter"}
        </button>
        <a href="/bid" className="text-center text-xs text-foreground/40 hover:text-foreground/70">
          Back to site
        </a>
      </form>
    </div>
  );
}
