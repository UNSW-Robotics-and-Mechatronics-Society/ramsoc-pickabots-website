"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  renderSmsTemplate,
  SMS_TEMPLATE_PLACEHOLDERS,
} from "@/lib/sms-template";

type ConfigResponse = {
  smsUpNextTemplate: string;
  smsUpNextDefault: string;
};

type ConfigPutResponse = { ok: true; smsUpNextTemplate: string } | { error: string };

export default function SettingsPanel() {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [template, setTemplate] = useState("");
  const [savedTemplate, setSavedTemplate] = useState("");
  const [defaultTemplate, setDefaultTemplate] = useState("");
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/config");
      if (!res.ok) throw new Error(`Failed to load settings (${res.status})`);
      const data = (await res.json()) as ConfigResponse;
      setTemplate(data.smsUpNextTemplate);
      setSavedTemplate(data.smsUpNextTemplate);
      setDefaultTemplate(data.smsUpNextDefault);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Fetch-on-mount; load() sets loading state internally (same idiom as the
    // other admin panels in this repo).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return () => { if (flashTimer.current) clearTimeout(flashTimer.current); };
  }, []);

  const charCount = template.length;
  const parts = charCount === 0 ? 0 : Math.ceil(charCount / 160);
  const dirty = template !== savedTemplate;

  const preview = useMemo(
    () => renderSmsTemplate(template, { team: "Iron Fist", division: "standards" }),
    [template],
  );

  function insertPlaceholder(placeholder: string) {
    setTemplate(prev => prev + placeholder);
    textareaRef.current?.focus();
  }

  function handleReset() {
    setTemplate(defaultTemplate);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsUpNextTemplate: template }),
      });
      const data = (await res.json()) as ConfigPutResponse;
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `Save failed (${res.status})`);
      }
      setTemplate(data.smsUpNextTemplate);
      setSavedTemplate(data.smsUpNextTemplate);
      setSavedFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="@container flex h-full flex-col">
      {/* toolbar */}
      <div className="shrink-0 border-b border-white/10 px-3 py-2">
        <h2 className="truncate text-xs uppercase tracking-[0.18em] text-foreground/55">
          SMS Settings
        </h2>
      </div>

      {/* scrollable body */}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading && (
          <p className="px-1 py-4 text-xs text-foreground/50">Loading settings…</p>
        )}
        {error && !loading && (
          <div className="mb-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-300">
            {error}
            <button onClick={load} className="ml-2 underline decoration-dotted">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-white/22 bg-[#0d1018] p-3">
              <h3 className="mb-1.5 text-xs font-medium text-foreground">
                &ldquo;Up next&rdquo; SMS template
              </h3>

              <textarea
                ref={textareaRef}
                value={template}
                onChange={e => setTemplate(e.target.value)}
                placeholder="Type the up-next SMS template…"
                rows={4}
                className="w-full resize-none rounded-lg border border-white/10 bg-white/8 px-2 py-1.5 text-xs text-foreground placeholder:text-foreground/30 outline-none focus:border-white/30"
              />

              <p className="mt-1 text-[0.6rem] text-foreground/35">
                {charCount} chars{parts > 1 ? ` · ${parts} SMS parts` : parts === 1 ? " · 1 SMS part" : ""}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[0.6rem] uppercase tracking-wider text-foreground/40">
                  Placeholders
                </span>
                {SMS_TEMPLATE_PLACEHOLDERS.map(ph => (
                  <button
                    key={ph}
                    onClick={() => insertPlaceholder(ph)}
                    title={`Insert ${ph}`}
                    className="rounded-lg border border-[#FF6B00]/30 bg-[#FF6B00]/10 px-2 py-0.5 text-[0.65rem] text-[#FF6B00] transition-colors hover:bg-[#FF6B00]/20"
                  >
                    {ph}
                  </button>
                ))}
              </div>

              {/* live preview */}
              <div className="mt-3">
                <span className="text-[0.6rem] uppercase tracking-wider text-foreground/40">
                  Preview
                </span>
                <p className="mt-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-foreground/80">
                  {preview}
                </p>
              </div>

              <p className="mt-3 text-[0.65rem] text-foreground/40">
                Sent automatically to both captains when their match is up next, and used
                by the &ldquo;up next&rdquo; button in a team&rsquo;s Contact panel.
              </p>

              {saveError && (
                <p className="mt-2 text-[0.65rem] text-red-300">{saveError}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="flex items-center gap-1.5 rounded-lg border border-[#FF6B00]/40 bg-[#FF6B00]/20 px-3 py-1.5 text-xs font-medium text-[#FF6B00] transition-colors hover:bg-[#FF6B00]/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Save size={12} />
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={handleReset}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCcw size={12} />
                  Reset to default
                </button>
                <span
                  className={cn(
                    "text-[0.65rem] text-green-300 transition-opacity",
                    savedFlash ? "opacity-100" : "opacity-0",
                  )}
                >
                  Saved ✓
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
