"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Save, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  renderSmsTemplate,
  SMS_TEMPLATE_PLACEHOLDERS,
  BROADCAST_PLACEHOLDERS,
  renderBroadcastTemplate,
} from "@/lib/sms-template";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

const DEFAULT_SMS_NOTIFY_LEAD = 2;

type ConfigResponse = {
  smsUpNextTemplate: string;
  smsUpNextDefault: string;
  smsNotifyLead?: number;
};

type ConfigPutResponse =
  | { ok: true; smsUpNextTemplate: string; smsNotifyLead: number }
  | { error: string };

type BroadcastCountsResponse = { total: number; withPhone: number };

type BroadcastResultRow = {
  to: string;
  ok: boolean;
  status: "sent" | "failed" | "skipped";
  error?: string;
};

type BroadcastPostResponse =
  | { sent: number; total: number; results: BroadcastResultRow[] }
  | { sent: 0; results: []; note: string }
  | { error: string };

export default function SettingsPanel() {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [template, setTemplate] = useState("");
  const [savedTemplate, setSavedTemplate] = useState("");
  const [defaultTemplate, setDefaultTemplate] = useState("");
  const [notifyLead, setNotifyLead] = useState(DEFAULT_SMS_NOTIFY_LEAD);
  const [savedNotifyLead, setSavedNotifyLead] = useState(DEFAULT_SMS_NOTIFY_LEAD);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Broadcast
  const [broadcastCounts, setBroadcastCounts] = useState<BroadcastCountsResponse | null>(null);
  const [broadcastCountsError, setBroadcastCountsError] = useState<string | null>(null);
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastConfirmOpen, setBroadcastConfirmOpen] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [broadcastResult, setBroadcastResult] = useState<
    { sent: number; total: number; results: BroadcastResultRow[] } | { note: string } | null
  >(null);
  // Test send (to manually-entered numbers).
  const [testNumbersInput, setTestNumbersInput] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<
    { sent: number; total: number; results: BroadcastResultRow[] } | { error: string } | null
  >(null);

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
      const lead = data.smsNotifyLead ?? DEFAULT_SMS_NOTIFY_LEAD;
      setNotifyLead(lead);
      setSavedNotifyLead(lead);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function loadBroadcastCounts() {
    setBroadcastCountsError(null);
    try {
      const res = await fetch("/api/admin/broadcast");
      if (!res.ok) throw new Error(`Failed to load captain counts (${res.status})`);
      const data = (await res.json()) as BroadcastCountsResponse;
      setBroadcastCounts(data);
    } catch (err) {
      setBroadcastCountsError(err instanceof Error ? err.message : "Failed to load captain counts");
    }
  }

  useEffect(() => {
    // Fetch-on-mount; load() sets loading state internally (same idiom as the
    // other admin panels in this repo).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    loadBroadcastCounts();
    return () => { if (flashTimer.current) clearTimeout(flashTimer.current); };
  }, []);

  const charCount = template.length;
  const parts = charCount === 0 ? 0 : Math.ceil(charCount / 160);
  const dirty = template !== savedTemplate || notifyLead !== savedNotifyLead;

  const broadcastCharCount = broadcastBody.length;
  const broadcastParts = broadcastCharCount === 0 ? 0 : Math.ceil(broadcastCharCount / 160);

  const preview = useMemo(
    () => renderSmsTemplate(template, { team: "Iron Fist", division: "standards" }),
    [template],
  );

  // Preview of a broadcast, rendered for a sample captain.
  const broadcastPreview = useMemo(
    () =>
      broadcastBody
        ? renderBroadcastTemplate(broadcastBody, {
            first: "Alex",
            captain: "Alex Chen",
            team: "Iron Fist",
            division: "standards",
          })
        : "",
    [broadcastBody],
  );

  function insertPlaceholder(placeholder: string) {
    setTemplate(prev => prev + placeholder);
    textareaRef.current?.focus();
  }

  function insertBroadcastPlaceholder(placeholder: string) {
    setBroadcastBody(prev => prev + placeholder);
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
        body: JSON.stringify({ smsUpNextTemplate: template, smsNotifyLead: notifyLead }),
      });
      const data = (await res.json()) as ConfigPutResponse;
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `Save failed (${res.status})`);
      }
      setTemplate(data.smsUpNextTemplate);
      setSavedTemplate(data.smsUpNextTemplate);
      setNotifyLead(data.smsNotifyLead);
      setSavedNotifyLead(data.smsNotifyLead);
      setSavedFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleNotifyLeadChange(raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setNotifyLead(Math.min(16, Math.max(1, Math.round(n))));
  }

  async function handleBroadcastSend() {
    setBroadcastConfirmOpen(false);
    setBroadcastSending(true);
    setBroadcastError(null);
    setBroadcastResult(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: broadcastBody }),
      });
      const data = (await res.json()) as BroadcastPostResponse;
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `Send failed (${res.status})`);
      }
      if ("note" in data) {
        setBroadcastResult({ note: data.note });
      } else {
        setBroadcastResult({ sent: data.sent, total: data.total, results: data.results });
      }
      // Refresh counts in case they changed since mount.
      loadBroadcastCounts();
    } catch (err) {
      setBroadcastError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBroadcastSending(false);
    }
  }

  function parseTestNumbers(raw: string): string[] {
    return raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  }

  async function handleSendTest() {
    const numbers = parseTestNumbers(testNumbersInput);
    if (numbers.length === 0 || broadcastBody.trim().length === 0) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: broadcastBody, testNumbers: numbers }),
      });
      const data = (await res.json()) as BroadcastPostResponse;
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `Test failed (${res.status})`);
      }
      setTestResult("note" in data ? { error: data.note } : { sent: data.sent, total: data.total, results: data.results });
    } catch (err) {
      setTestResult({ error: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setTestSending(false);
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

              <div className="mt-4 border-t border-white/10 pt-3">
                <label className="flex flex-wrap items-center gap-1.5 text-xs text-foreground">
                  Alert captains when their team is
                  <input
                    type="number"
                    min={1}
                    max={16}
                    step={1}
                    value={notifyLead}
                    onChange={e => handleNotifyLeadChange(e.target.value)}
                    className="w-14 rounded-lg border border-white/10 bg-white/8 px-2 py-1 text-center text-xs text-foreground outline-none focus:border-white/30"
                  />
                  matches from playing
                </label>
                <p className="mt-1.5 text-[0.65rem] text-foreground/40">
                  2 = they get the heads-up one match before they&rsquo;re on-deck, so
                  they&rsquo;re already at the arena.
                </p>
              </div>

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

            <div className="rounded-2xl border border-white/22 bg-[#0d1018] p-3">
              <h3 className="mb-1.5 text-xs font-medium text-foreground">
                Broadcast to all captains
              </h3>

              {broadcastCountsError && (
                <p className="mb-2 text-[0.65rem] text-red-300">{broadcastCountsError}</p>
              )}

              <p className="mb-2 text-[0.65rem] text-foreground/50">
                {broadcastCounts
                  ? `${broadcastCounts.total} captains · ${broadcastCounts.withPhone} with a phone number`
                  : "Loading captain counts…"}
              </p>

              <textarea
                value={broadcastBody}
                onChange={e => setBroadcastBody(e.target.value)}
                placeholder="Hey! Welcome to Sumobots 2026 — knockouts start now. Your bot is up soon, head to the arena…"
                rows={4}
                className="w-full resize-none rounded-lg border border-white/10 bg-white/8 px-2 py-1.5 text-xs text-foreground placeholder:text-foreground/30 outline-none focus:border-white/30"
              />

              <p className="mt-1 text-[0.6rem] text-foreground/35">
                {broadcastCharCount} chars
                {broadcastParts > 1
                  ? ` · ${broadcastParts} SMS parts`
                  : broadcastParts === 1
                  ? " · 1 SMS part"
                  : ""}
              </p>

              {/* Per-captain placeholders */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[0.6rem] uppercase tracking-wider text-foreground/40">Insert</span>
                {BROADCAST_PLACEHOLDERS.map(ph => (
                  <button
                    key={ph}
                    type="button"
                    onClick={() => insertBroadcastPlaceholder(ph)}
                    className="rounded-md border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-1.5 py-0.5 font-mono text-[0.6rem] text-[#FF6B00] transition-colors hover:bg-[#FF6B00]/20"
                  >
                    {ph}
                  </button>
                ))}
              </div>

              {broadcastPreview && (
                <div className="mt-2">
                  <span className="text-[0.6rem] uppercase tracking-wider text-foreground/40">Preview</span>
                  <p className="mt-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-foreground/80">
                    {broadcastPreview}
                  </p>
                </div>
              )}

              {broadcastError && (
                <p className="mt-2 text-[0.65rem] text-red-300">{broadcastError}</p>
              )}

              {broadcastResult && "note" in broadcastResult && (
                <p className="mt-2 text-[0.65rem] text-foreground/50">{broadcastResult.note}</p>
              )}

              {broadcastResult && "sent" in broadcastResult && (
                <div className="mt-2">
                  <p className="text-[0.65rem] text-green-300">
                    Sent {broadcastResult.sent}/{broadcastResult.total}
                  </p>
                  {broadcastResult.results.some(r => r.status !== "sent") && (
                    <ul className="mt-1 space-y-0.5 text-[0.6rem] text-foreground/50">
                      {broadcastResult.results
                        .filter(r => r.status !== "sent")
                        .slice(0, 5)
                        .map((r, i) => (
                          <li key={`${r.to}-${i}`} className="truncate">
                            {r.to} — {r.status}
                            {r.error ? `: ${r.error}` : ""}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Test send — fire the message above to your own number(s) first */}
              <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <span className="text-[0.6rem] uppercase tracking-wider text-foreground/40">Test send</span>
                <p className="mt-0.5 text-[0.6rem] text-foreground/35">
                  Send the message above to specific number(s) first. Comma or newline separated.
                </p>
                <input
                  type="text"
                  value={testNumbersInput}
                  onChange={e => setTestNumbersInput(e.target.value)}
                  placeholder="0412 345 678, 0498 765 432"
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/8 px-2 py-1.5 text-xs text-foreground placeholder:text-foreground/30 outline-none focus:border-white/30"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleSendTest}
                    disabled={testSending || broadcastBody.trim().length === 0 || parseTestNumbers(testNumbersInput).length === 0}
                    className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {testSending ? "Sending…" : "Send test"}
                  </button>
                  {testResult && "error" in testResult && (
                    <span className="text-[0.65rem] text-red-300">{testResult.error}</span>
                  )}
                  {testResult && "sent" in testResult && (
                    <span className="text-[0.65rem] text-green-300">Test sent {testResult.sent}/{testResult.total}</span>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <button
                  onClick={() => setBroadcastConfirmOpen(true)}
                  disabled={broadcastSending || broadcastBody.trim().length === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-[#FF6B00]/40 bg-[#FF6B00]/20 px-3 py-1.5 text-xs font-medium text-[#FF6B00] transition-colors hover:bg-[#FF6B00]/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send size={12} />
                  {broadcastSending ? "Sending…" : "Send to all captains"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {broadcastConfirmOpen && (
        <ConfirmDialog
          title="Send broadcast?"
          message={`Send this message to all ${broadcastCounts?.withPhone ?? 0} captains? This can't be undone.`}
          confirmLabel="Send"
          onConfirm={handleBroadcastSend}
          onCancel={() => setBroadcastConfirmOpen(false)}
        />
      )}
    </div>
  );
}
