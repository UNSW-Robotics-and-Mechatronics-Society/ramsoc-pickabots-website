"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Save, Send, Upload, AlertTriangle, Coins, HandCoins } from "lucide-react";
import { cn } from "@/lib/cn";
import { type Division, type TeamCount } from "@/lib/mock-data";
import {
  renderSmsTemplate,
  SMS_TEMPLATE_PLACEHOLDERS,
  BROADCAST_PLACEHOLDERS,
  renderBroadcastTemplate,
} from "@/lib/sms-template";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import AutoFillModePicker from "@/components/admin/AutoFillModePicker";
import type { AutoFillMode } from "@/lib/seeds";
import {
  DEFAULT_BEG_THRESHOLD,
  BEG_THRESHOLD_MIN,
  BEG_THRESHOLD_MAX,
  DEFAULT_BEG_MAX_AWARD,
  BEG_MAX_AWARD_MIN,
  BEG_MAX_AWARD_MAX,
  begCeilingFor,
  begMinAwardFor,
} from "@/lib/beg-config";

const DEFAULT_SMS_NOTIFY_LEAD = 2;

// Pre-filled amount for the "give everyone RamCoin" top-up — the usual
// mid-event handout, editable per run. MAX mirrors the API's own guard.
const DEFAULT_TOKEN_GRANT = 500;
const MAX_TOKEN_GRANT = 100_000;

// One parsed row of the seed-import CSV. Structurally matches AdminPageClient's
// SeedImportRow/SeedImportResult (the callback contract), kept local so this
// panel doesn't import from its own parent.
type SeedImportRow = { name: string; division: Division; seed: number };
type SeedDuplicate = { division: Division; seed: number; names: string[] };
// A non-empty `duplicates` means the whole import was rejected (imported: 0).
type SeedImportResult = { imported: number; unmatched: SeedImportRow[]; duplicates?: SeedDuplicate[] };

type Props = {
  division: Division;
  /** THIS division's bracket size — each division has its own. */
  teamCount: TeamCount;
  /** The sizes offered in the picker. */
  teamCountOptions: TeamCount[];
  /** Resizes the division currently on screen only. */
  onTeamCountChange: (n: TeamCount) => void;
  onSetAllPresent: (present: boolean) => Promise<void>;
  onSetAllInBracket: (inBracket: boolean) => Promise<void>;
  onImportSeeds: (rows: SeedImportRow[]) => Promise<SeedImportResult>;
  onAutoFill: (mode: AutoFillMode) => void;
  onResetAll: () => void;
};

// ClickSend AU SMS pricing — used only to estimate spend before a bulk send;
// each multi-part message (>160 chars) is billed per part.
const SMS_COST_AUD = 0.08;
function estimateCostAud(recipients: number, parts: number): number {
  return recipients * Math.max(parts, 1) * SMS_COST_AUD;
}

type SmsSenderMode = "senderid" | "number";

type ConfigResponse = {
  smsUpNextTemplate: string;
  smsUpNextDefault: string;
  smsNotifyLead?: number;
  allIn?: boolean;
  autoSmsEnabled?: boolean;
  smsSenderMode?: SmsSenderMode;
  smsSenderNumber?: string;
  finalsDay?: boolean;
  begThreshold?: number;
  begMaxAward?: number;
};

type ConfigPutResponse =
  | {
      ok: true;
      smsUpNextTemplate: string;
      smsNotifyLead: number;
      allIn?: boolean;
      autoSmsEnabled?: boolean;
      smsSenderMode?: SmsSenderMode;
      smsSenderNumber?: string;
      finalsDay?: boolean;
      begThreshold?: number;
      begMaxAward?: number;
    }
  | { error: string };

const DIVISION_LABEL: Record<Division, string> = { standards: "Standards", open: "Open" };

function normalizeDivision(raw: string): Division | null {
  const s = raw.trim().toLowerCase();
  if (s === "standards" || s === "standard" || s === "std") return "standards";
  if (s === "open" || s === "opn") return "open";
  return null;
}

/**
 * Parses the "Import seeds" file: one team per line as `name, division, seed`
 * (comma OR pipe delimited). A non-numeric seed on the first line is treated
 * as a header and skipped. Returns valid rows plus a reason for each bad one.
 */
function parseSeedCsv(text: string): { valid: SeedImportRow[]; invalid: { line: string; reason: string }[] } {
  const valid: SeedImportRow[] = [];
  const invalid: { line: string; reason: string }[] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  lines.forEach((line, idx) => {
    const parts = line.split(line.includes("|") ? "|" : ",").map(p => p.trim());
    if (parts.length < 3) { invalid.push({ line, reason: "expected name, division, seed" }); return; }
    const [name, divRaw, seedRaw] = parts;
    const seed = Number(seedRaw);
    // Header row: first line whose seed column isn't a number.
    if (idx === 0 && !Number.isFinite(seed)) return;
    const division = normalizeDivision(divRaw);
    if (!name) { invalid.push({ line, reason: "missing team name" }); return; }
    if (!division) { invalid.push({ line, reason: `unknown division "${divRaw}"` }); return; }
    if (!Number.isFinite(seed) || seed < 1) { invalid.push({ line, reason: `invalid seed "${seedRaw}"` }); return; }
    valid.push({ name, division, seed: Math.trunc(seed) });
  });
  return { valid, invalid };
}

type GrantTokensResponse = { ok: true; amount: number; players: number } | { error: string };

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

export default function SettingsPanel({
  division, teamCount, teamCountOptions,
  onTeamCountChange, onSetAllPresent, onSetAllInBracket,
  onImportSeeds, onAutoFill, onResetAll,
}: Props) {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [template, setTemplate] = useState("");

  // ── Team / Player / Reset sections ─────────────────────────────────────────
  const [allIn, setAllIn]           = useState(false);
  const [allInBusy, setAllInBusy]   = useState(false);
  const [finalsDay, setFinalsDay]         = useState(false);
  const [finalsDayBusy, setFinalsDayBusy] = useState(false);
  // Beg limits — both held as strings so the fields can be cleared and retyped.
  const [begInput, setBegInput]                 = useState(String(DEFAULT_BEG_THRESHOLD));
  const [savedBegThreshold, setSavedBegThreshold] = useState(DEFAULT_BEG_THRESHOLD);
  const [begAwardInput, setBegAwardInput]       = useState(String(DEFAULT_BEG_MAX_AWARD));
  const [savedBegMaxAward, setSavedBegMaxAward] = useState(DEFAULT_BEG_MAX_AWARD);
  const [begSaving, setBegSaving]               = useState(false);
  const [begError, setBegError]                 = useState<string | null>(null);
  const [begFlash, setBegFlash]                 = useState(false);
  const [autoSmsEnabled, setAutoSmsEnabled] = useState(true);
  const [autoSmsBusy, setAutoSmsBusy]       = useState(false);
  const [senderMode, setSenderMode]         = useState<SmsSenderMode>("senderid");
  const [senderModeBusy, setSenderModeBusy] = useState(false);
  const [senderNumber, setSenderNumber]         = useState("");
  const [savedSenderNumber, setSavedSenderNumber] = useState("");
  const [senderNumberSaving, setSenderNumberSaving] = useState(false);
  const [senderNumberError, setSenderNumberError]   = useState<string | null>(null);
  const [senderNumberFlash, setSenderNumberFlash]   = useState(false);
  const [teamActionBusy, setTeamActionBusy] = useState(false);
  const [teamActionMsg, setTeamActionMsg]   = useState<string | null>(null);
  const [seedText, setSeedText]     = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<
    {
      imported: number;
      unmatched: SeedImportRow[];
      invalid: { line: string; reason: string }[];
      duplicates?: SeedDuplicate[];
    } | null
  >(null);
  const [pendingAutoFill, setPendingAutoFill] = useState(false);
  // Round 1 layout for the next Auto Fill — a per-run choice, not a saved setting.
  const [autoFillMode, setAutoFillMode] = useState<AutoFillMode>('worst-plays-best');
  const [confirmResetTokens, setConfirmResetTokens] = useState(false);
  const [confirmResetAll, setConfirmResetAll]       = useState(false);
  const [resetTokensMsg, setResetTokensMsg]         = useState<string | null>(null);
  // Held as a string so the field can be cleared and retyped; parsed below.
  const [grantInput, setGrantInput]     = useState(String(DEFAULT_TOKEN_GRANT));
  const [grantBusy, setGrantBusy]       = useState(false);
  const [confirmGrant, setConfirmGrant] = useState(false);
  const [grantMsg, setGrantMsg]         = useState<string | null>(null);
  const seedFileRef = useRef<HTMLInputElement | null>(null);
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
  // Custom number list (to manually-entered numbers — a past-competitor list,
  // your own phone for a test, etc.). Same send path, gated the same way.
  const [testNumbersInput, setTestNumbersInput] = useState("");
  const [testConfirmOpen, setTestConfirmOpen] = useState(false);
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
      setAllIn(data.allIn ?? false);
      setFinalsDay(data.finalsDay ?? false);
      const beg = data.begThreshold ?? DEFAULT_BEG_THRESHOLD;
      setBegInput(String(beg));
      setSavedBegThreshold(beg);
      const begAward = data.begMaxAward ?? DEFAULT_BEG_MAX_AWARD;
      setBegAwardInput(String(begAward));
      setSavedBegMaxAward(begAward);
      setAutoSmsEnabled(data.autoSmsEnabled ?? true);
      setSenderMode(data.smsSenderMode ?? "senderid");
      const number = data.smsSenderNumber ?? "";
      setSenderNumber(number);
      setSavedSenderNumber(number);
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

  // Empty / non-numeric input parses to NaN or 0 — both invalid, which just
  // leaves the Give button disabled rather than nagging mid-type.
  const grantAmount = Math.trunc(Number(grantInput));
  const grantValid = Number.isFinite(grantAmount) && grantAmount > 0 && grantAmount <= MAX_TOKEN_GRANT;

  // Same idiom: an empty/garbled field just leaves Save disabled. The ceiling and
  // the band-edge award are both derived from these two numbers (see
  // begCeilingFor / begMinAwardFor), so they're previewed live off whatever is
  // typed rather than waiting for a save.
  const begThreshold = Math.trunc(Number(begInput));
  const begThresholdValid =
    begInput.trim() !== "" &&
    Number.isFinite(begThreshold) &&
    begThreshold >= BEG_THRESHOLD_MIN &&
    begThreshold <= BEG_THRESHOLD_MAX;
  const begMaxAward = Math.trunc(Number(begAwardInput));
  const begMaxAwardValid =
    begAwardInput.trim() !== "" &&
    Number.isFinite(begMaxAward) &&
    begMaxAward >= BEG_MAX_AWARD_MIN &&
    begMaxAward <= BEG_MAX_AWARD_MAX;
  const begValid = begThresholdValid && begMaxAwardValid;
  const begDirty =
    begValid && (begThreshold !== savedBegThreshold || begMaxAward !== savedBegMaxAward);
  const begPreviewThreshold = begThresholdValid ? begThreshold : savedBegThreshold;
  const begPreviewAward = begMaxAwardValid ? begMaxAward : savedBegMaxAward;
  const begCeiling = begCeilingFor(begPreviewThreshold, begPreviewAward);
  const begEdgeAward = begMinAwardFor(begPreviewAward);

  const broadcastCharCount = broadcastBody.length;
  const broadcastParts = broadcastCharCount === 0 ? 0 : Math.ceil(broadcastCharCount / 160);

  const testNumbersCount = useMemo(() => parseTestNumbers(testNumbersInput).length, [testNumbersInput]);
  const testCostAud = estimateCostAud(testNumbersCount, broadcastParts);

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

  // ── Team Settings actions (all current-division only) ──────────────────────
  async function runTeamAction(label: string, fn: () => Promise<void>) {
    setTeamActionBusy(true);
    setTeamActionMsg(null);
    try {
      await fn();
      setTeamActionMsg(label);
    } catch (err) {
      setTeamActionMsg(err instanceof Error ? err.message : "Action failed");
    } finally {
      setTeamActionBusy(false);
    }
  }

  async function loadSeedFile(file: File) {
    setSeedText(await file.text());
    setImportResult(null);
  }

  async function handleImportSeeds() {
    const { valid, invalid } = parseSeedCsv(seedText);
    if (valid.length === 0) {
      setImportResult({ imported: 0, unmatched: [], invalid });
      return;
    }
    setImportBusy(true);
    try {
      const { imported, unmatched, duplicates } = await onImportSeeds(valid);
      setImportResult({ imported, unmatched, invalid, duplicates });
      // Don't offer to re-seed the bracket off an import that was rejected.
      if (imported > 0) setPendingAutoFill(true);
    } catch (err) {
      setImportResult({ imported: 0, unmatched: [], invalid: [{ line: "", reason: err instanceof Error ? err.message : "Import failed" }] });
    } finally {
      setImportBusy(false);
    }
  }

  // ── Player Settings actions ────────────────────────────────────────────────
  async function toggleAllIn() {
    const next = !allIn;
    setAllInBusy(true);
    setAllIn(next); // optimistic
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allIn: next }),
      });
      const data = (await res.json()) as ConfigPutResponse;
      if (!res.ok || "error" in data) throw new Error("error" in data ? data.error : `Save failed (${res.status})`);
      setAllIn(data.allIn ?? next);
    } catch {
      setAllIn(!next); // revert
    } finally {
      setAllInBusy(false);
    }
  }

  // Finals Day is presentation only — it never moves a match (finals always live
  // on their own ring; see FinalsSchedule), so flipping it is safe mid-event and
  // instantly reversible.
  async function toggleFinalsDay() {
    const next = !finalsDay;
    setFinalsDayBusy(true);
    setFinalsDay(next); // optimistic
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalsDay: next }),
      });
      const data = (await res.json()) as ConfigPutResponse;
      if (!res.ok || "error" in data) throw new Error("error" in data ? data.error : `Save failed (${res.status})`);
      setFinalsDay(data.finalsDay ?? next);
    } catch {
      setFinalsDay(!next); // revert
    } finally {
      setFinalsDayBusy(false);
    }
  }

  // Takes effect immediately for every player: /api/beg reads both numbers on
  // each call, so a player already sitting under a raised threshold can beg on
  // their next tap (and the "Down bad?" banner appears for them on their next
  // refresh).
  async function handleSaveBegLimits() {
    if (!begValid) return;
    setBegSaving(true);
    setBegError(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ begThreshold, begMaxAward }),
      });
      const data = (await res.json()) as ConfigPutResponse;
      if (!res.ok || "error" in data) throw new Error("error" in data ? data.error : `Save failed (${res.status})`);
      const savedThreshold = data.begThreshold ?? begThreshold;
      const savedAward = data.begMaxAward ?? begMaxAward;
      setBegInput(String(savedThreshold));
      setSavedBegThreshold(savedThreshold);
      setBegAwardInput(String(savedAward));
      setSavedBegMaxAward(savedAward);
      setBegFlash(true);
      setTimeout(() => setBegFlash(false), 2000);
    } catch (err) {
      setBegError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBegSaving(false);
    }
  }

  async function toggleAutoSms() {
    const next = !autoSmsEnabled;
    setAutoSmsBusy(true);
    setAutoSmsEnabled(next); // optimistic
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSmsEnabled: next }),
      });
      const data = (await res.json()) as ConfigPutResponse;
      if (!res.ok || "error" in data) throw new Error("error" in data ? data.error : `Save failed (${res.status})`);
      setAutoSmsEnabled(data.autoSmsEnabled ?? next);
    } catch {
      setAutoSmsEnabled(!next); // revert
    } finally {
      setAutoSmsBusy(false);
    }
  }

  async function setSenderModeRemote(next: SmsSenderMode) {
    const prev = senderMode;
    setSenderModeBusy(true);
    setSenderMode(next); // optimistic
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsSenderMode: next }),
      });
      const data = (await res.json()) as ConfigPutResponse;
      if (!res.ok || "error" in data) throw new Error("error" in data ? data.error : `Save failed (${res.status})`);
      setSenderMode(data.smsSenderMode ?? next);
    } catch {
      setSenderMode(prev); // revert
    } finally {
      setSenderModeBusy(false);
    }
  }

  async function handleSaveSenderNumber() {
    setSenderNumberSaving(true);
    setSenderNumberError(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsSenderNumber: senderNumber }),
      });
      const data = (await res.json()) as ConfigPutResponse;
      if (!res.ok || "error" in data) throw new Error("error" in data ? data.error : `Save failed (${res.status})`);
      const number = data.smsSenderNumber ?? senderNumber;
      setSenderNumber(number);
      setSavedSenderNumber(number);
      setSenderNumberFlash(true);
      setTimeout(() => setSenderNumberFlash(false), 2000);
    } catch (err) {
      setSenderNumberError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSenderNumberSaving(false);
    }
  }

  async function handleResetTokens() {
    setConfirmResetTokens(false);
    setResetTokensMsg(null);
    try {
      const res = await fetch("/api/admin/reset-tokens", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Reset failed (${res.status})`);
      setResetTokensMsg("Every player reset to 100 RamCoin ✓");
    } catch (err) {
      setResetTokensMsg(err instanceof Error ? err.message : "Reset failed");
    }
  }

  // Adds to every balance rather than overwriting it, so the standings order is
  // preserved — see /api/admin/grant-tokens.
  async function handleGrantTokens() {
    setConfirmGrant(false);
    if (!grantValid) return;
    setGrantBusy(true);
    setGrantMsg(null);
    try {
      const res = await fetch("/api/admin/grant-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: grantAmount }),
      });
      const data = (await res.json()) as GrantTokensResponse;
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `Grant failed (${res.status})`);
      }
      setGrantMsg(
        `+${data.amount} RamCoin to ${data.players} player${data.players === 1 ? "" : "s"} ✓`,
      );
    } catch (err) {
      setGrantMsg(err instanceof Error ? err.message : "Grant failed");
    } finally {
      setGrantBusy(false);
    }
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
    setTestConfirmOpen(false);
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
          Settings
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
            {/* ── Team Settings ──────────────────────────────────────────── */}
            <div className="rounded-2xl border border-white/22 bg-[#0d1018] p-3">
              <h3 className="mb-2 text-xs font-medium text-foreground">Team Settings</h3>

              {/* Bracket size — per division, so the label names which one this
                  picker is changing (the same control shows a different value
                  when the division toggle is flipped). */}
              <div className="mb-3">
                <span className="text-[0.6rem] uppercase tracking-wider text-foreground/40">
                  Number of Teams · {DIVISION_LABEL[division]}
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {teamCountOptions.map(n => (
                    <button
                      key={n}
                      onClick={() => onTeamCountChange(n)}
                      className={cn(
                        "rounded px-2.5 py-1 text-xs transition-colors",
                        teamCount === n
                          ? "bg-white/20 text-foreground"
                          : "bg-white/5 text-foreground/50 hover:text-foreground/80",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bulk present / in-bracket — current division only */}
              <div className="mb-3 border-t border-white/10 pt-3">
                <span className="text-[0.6rem] uppercase tracking-wider text-foreground/40">
                  Bulk actions · {DIVISION_LABEL[division]}
                </span>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <button
                    disabled={teamActionBusy}
                    onClick={() => runTeamAction(`All ${DIVISION_LABEL[division]} teams set present`, () => onSetAllPresent(true))}
                    className="rounded-lg border border-green-400/40 bg-green-400/15 px-2.5 py-1 text-xs text-green-300 transition-colors hover:bg-green-400/25 disabled:opacity-40"
                  >
                    All Present
                  </button>
                  <button
                    disabled={teamActionBusy}
                    onClick={() => runTeamAction(`All ${DIVISION_LABEL[division]} teams set absent`, () => onSetAllPresent(false))}
                    className="rounded-lg border border-red-400/30 bg-red-400/10 px-2.5 py-1 text-xs text-red-300/80 transition-colors hover:bg-red-400/20 disabled:opacity-40"
                  >
                    All Absent
                  </button>
                  <span className="mx-1 text-foreground/20">·</span>
                  <button
                    disabled={teamActionBusy}
                    onClick={() => runTeamAction(`All ${DIVISION_LABEL[division]} teams added to bracket`, () => onSetAllInBracket(true))}
                    className="rounded-lg border border-purple-400/50 bg-purple-400/20 px-2.5 py-1 text-xs text-purple-300 transition-colors hover:bg-purple-400/30 disabled:opacity-40"
                  >
                    All In Bracket
                  </button>
                  <button
                    disabled={teamActionBusy}
                    onClick={() => runTeamAction(`All ${DIVISION_LABEL[division]} teams removed from bracket`, () => onSetAllInBracket(false))}
                    className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-foreground/50 transition-colors hover:text-foreground/80 disabled:opacity-40"
                  >
                    All Out
                  </button>
                </div>
                {teamActionMsg && <p className="mt-1.5 text-[0.65rem] text-foreground/50">{teamActionMsg}</p>}
              </div>

              {/* Import seeds */}
              <div className="border-t border-white/10 pt-3">
                <span className="text-[0.6rem] uppercase tracking-wider text-foreground/40">Import Seeds</span>
                <p className="mt-0.5 text-[0.6rem] text-foreground/35">
                  One team per line: <span className="font-mono text-foreground/50">name, division, seed</span> (comma or | separated). Seed 1 is the top seed. Updates existing teams by name — it can&rsquo;t create new ones.
                </p>
                <textarea
                  value={seedText}
                  onChange={e => { setSeedText(e.target.value); setImportResult(null); }}
                  placeholder={"Iron Fist, standards, 1\nVoltage, standards, 2\nInferno, open, 1"}
                  rows={4}
                  className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-white/8 px-2 py-1.5 font-mono text-[0.7rem] text-foreground placeholder:text-foreground/25 outline-none focus:border-white/30"
                />
                <input
                  ref={seedFileRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) loadSeedFile(f); e.target.value = ""; }}
                />
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => seedFileRef.current?.click()}
                    className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-xs text-foreground/70 transition-colors hover:bg-white/10"
                  >
                    Choose CSV…
                  </button>
                  <button
                    disabled={importBusy || seedText.trim() === ""}
                    onClick={handleImportSeeds}
                    className="flex items-center gap-1.5 rounded-lg border border-[#FF6B00]/40 bg-[#FF6B00]/20 px-2.5 py-1 text-xs font-medium text-[#FF6B00] transition-colors hover:bg-[#FF6B00]/30 disabled:opacity-40"
                  >
                    <Upload size={12} />
                    {importBusy ? "Importing…" : "Import Seeds"}
                  </button>
                </div>
                {importResult && (
                  <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-2 text-[0.65rem]">
                    {importResult.imported > 0 && (
                      <p className="text-green-300">Imported {importResult.imported} seed{importResult.imported === 1 ? "" : "s"} ✓</p>
                    )}
                    {/* Rejected whole — nothing was written, so the seeds on
                        screen are unchanged and the file can be fixed and
                        re-imported. */}
                    {importResult.duplicates && importResult.duplicates.length > 0 && (
                      <div className="text-foreground/55">
                        <p className="text-red-300">Nothing imported — duplicate seeds:</p>
                        <ul className="mt-0.5 space-y-0.5">
                          {importResult.duplicates.slice(0, 6).map((d, i) => (
                            <li key={i} className="truncate">
                              • {DIVISION_LABEL[d.division]} seed {d.seed} — {d.names.join(", ")}
                            </li>
                          ))}
                          {importResult.duplicates.length > 6 && <li>…and {importResult.duplicates.length - 6} more</li>}
                        </ul>
                        <p className="mt-1 text-foreground/40">Each team in a division needs its own seed.</p>
                      </div>
                    )}
                    {importResult.unmatched.length > 0 && (
                      <div className="mt-1 text-foreground/55">
                        <p className="text-amber-300/80">{importResult.unmatched.length} skipped — no matching team:</p>
                        <ul className="mt-0.5 space-y-0.5">
                          {importResult.unmatched.slice(0, 6).map((r, i) => (
                            <li key={i} className="truncate">• {r.name} / {r.division} (seed {r.seed})</li>
                          ))}
                          {importResult.unmatched.length > 6 && <li>…and {importResult.unmatched.length - 6} more</li>}
                        </ul>
                      </div>
                    )}
                    {importResult.invalid.length > 0 && (
                      <div className="mt-1 text-foreground/55">
                        <p className="text-red-300/80">{importResult.invalid.length} unreadable row{importResult.invalid.length === 1 ? "" : "s"}:</p>
                        <ul className="mt-0.5 space-y-0.5">
                          {importResult.invalid.slice(0, 6).map((r, i) => (
                            <li key={i} className="truncate">• {r.line ? `"${r.line}" — ` : ""}{r.reason}</li>
                          ))}
                          {importResult.invalid.length > 6 && <li>…and {importResult.invalid.length - 6} more</li>}
                        </ul>
                      </div>
                    )}
                    {importResult.imported === 0 && importResult.unmatched.length === 0 && importResult.invalid.length === 0 && (
                      <p className="text-foreground/50">Nothing to import.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── SMS Settings ───────────────────────────────────────────── */}
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

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                <div className="min-w-0">
                  <p className="text-xs text-foreground">Auto captain texts</p>
                  <p className="text-[0.65rem] text-foreground/40">
                    Turn off to stop the automatic &ldquo;up next&rdquo; texts that fire on every
                    bracket save — e.g. while testing/dev, so real captains don&rsquo;t get spammed.
                    The manual &ldquo;up next&rdquo; button and broadcasts still work either way.
                  </p>
                </div>
                <button
                  disabled={autoSmsBusy}
                  onClick={toggleAutoSms}
                  className={cn(
                    "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
                    autoSmsEnabled
                      ? "border-[#FF6B00]/60 bg-[#FF6B00]/25 text-[#FF6B00]"
                      : "border-white/15 bg-white/5 text-foreground/50 hover:text-foreground/80",
                  )}
                >
                  {autoSmsEnabled ? "AUTO TEXTS: ON" : "AUTO TEXTS: OFF"}
                </button>
              </div>

              <div className="mt-3 border-t border-white/10 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-foreground">Send from</p>
                    <p className="text-[0.65rem] text-foreground/40">
                      Use the RAMSOC sender ID (one-way, no reply) once it&rsquo;s registered, or a
                      real mobile number (two-way) in the meantime.
                    </p>
                  </div>
                  <div className="flex shrink-0 overflow-hidden rounded-lg border border-white/15">
                    <button
                      disabled={senderModeBusy}
                      onClick={() => setSenderModeRemote("senderid")}
                      className={cn(
                        "px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
                        senderMode === "senderid"
                          ? "bg-[#FF6B00]/25 text-[#FF6B00]"
                          : "bg-white/5 text-foreground/50 hover:text-foreground/80",
                      )}
                    >
                      Sender ID
                    </button>
                    <button
                      disabled={senderModeBusy}
                      onClick={() => setSenderModeRemote("number")}
                      className={cn(
                        "border-l border-white/15 px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
                        senderMode === "number"
                          ? "bg-[#FF6B00]/25 text-[#FF6B00]"
                          : "bg-white/5 text-foreground/50 hover:text-foreground/80",
                      )}
                    >
                      My Number
                    </button>
                  </div>
                </div>

                {senderMode === "number" && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <input
                      type="tel"
                      value={senderNumber}
                      onChange={e => setSenderNumber(e.target.value)}
                      placeholder="0412 345 678"
                      className="w-36 rounded-lg border border-white/10 bg-white/8 px-2 py-1 text-xs text-foreground placeholder:text-foreground/25 outline-none focus:border-white/30"
                    />
                    <button
                      onClick={handleSaveSenderNumber}
                      disabled={senderNumberSaving || senderNumber === savedSenderNumber}
                      className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-xs text-foreground/70 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {senderNumberSaving ? "Saving…" : "Save number"}
                    </button>
                    <span
                      className={cn(
                        "text-[0.65rem] text-green-300 transition-opacity",
                        senderNumberFlash ? "opacity-100" : "opacity-0",
                      )}
                    >
                      Saved ✓
                    </span>
                    {senderNumberError && (
                      <span className="text-[0.65rem] text-red-300">{senderNumberError}</span>
                    )}
                  </div>
                )}
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

              {/* Custom number list — for a personal test, or any list you already
                  have (e.g. past competitors) that isn't in the captain roster. */}
              <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <span className="text-[0.6rem] uppercase tracking-wider text-foreground/40">Send to custom number list</span>
                <p className="mt-0.5 text-[0.6rem] text-foreground/35">
                  Send the message above to any number(s) — your own for a test, or a list
                  you already have (e.g. past competitors). Comma or newline separated.
                </p>
                <textarea
                  value={testNumbersInput}
                  onChange={e => setTestNumbersInput(e.target.value)}
                  placeholder="0412 345 678, 0498 765 432"
                  rows={2}
                  className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-white/8 px-2 py-1.5 text-xs text-foreground placeholder:text-foreground/30 outline-none focus:border-white/30"
                />
                {testNumbersCount > 0 && (
                  <p className="mt-1 text-[0.6rem] text-foreground/40">
                    {testNumbersCount} number{testNumbersCount === 1 ? "" : "s"} · est.{" "}
                    <span className="text-foreground/60">${testCostAud.toFixed(2)} AUD</span>
                    {broadcastParts > 1 ? ` (${broadcastParts} SMS parts each)` : ""}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setTestConfirmOpen(true)}
                    disabled={testSending || broadcastBody.trim().length === 0 || testNumbersCount === 0}
                    className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {testSending ? "Sending…" : "Send"}
                  </button>
                  {testResult && "error" in testResult && (
                    <span className="text-[0.65rem] text-red-300">{testResult.error}</span>
                  )}
                  {testResult && "sent" in testResult && (
                    <span className="text-[0.65rem] text-green-300">Sent {testResult.sent}/{testResult.total}</span>
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
                {broadcastCounts && broadcastCounts.withPhone > 0 && (
                  <span className="ml-2 text-[0.6rem] text-foreground/40">
                    est. ${estimateCostAud(broadcastCounts.withPhone, broadcastParts).toFixed(2)} AUD
                  </span>
                )}
              </div>
            </div>

            {/* ── Player Settings ────────────────────────────────────────── */}
            <div className="rounded-2xl border border-white/22 bg-[#0d1018] p-3">
              <h3 className="mb-2 text-xs font-medium text-foreground">Player Settings</h3>

              {/* Top-up — ADDS to every balance, so the standings order survives
                  (unlike the flat reset below). */}
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-foreground">Give every player RamCoin</p>
                  <p className="text-[0.65rem] text-foreground/40">
                    Adds this amount on top of each player&rsquo;s current balance, so the
                    leaderboard order is unchanged. Voting history is kept.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={MAX_TOKEN_GRANT}
                    step={50}
                    value={grantInput}
                    onChange={e => { setGrantInput(e.target.value); setGrantMsg(null); }}
                    className="w-20 rounded-lg border border-white/10 bg-white/8 px-2 py-1.5 text-center text-xs text-foreground outline-none focus:border-white/30"
                  />
                  <button
                    onClick={() => setConfirmGrant(true)}
                    disabled={grantBusy || !grantValid}
                    className="flex items-center gap-1.5 rounded-lg border border-green-400/40 bg-green-400/15 px-3 py-1.5 text-xs font-medium text-green-300 transition-colors hover:bg-green-400/25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <HandCoins size={12} />
                    {grantBusy ? "Giving…" : "Give All"}
                  </button>
                </div>
              </div>
              {grantMsg && <p className="mt-1.5 text-[0.65rem] text-foreground/50">{grantMsg}</p>}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                <div className="min-w-0">
                  <p className="text-xs text-foreground">Reset all players&rsquo; RamCoin</p>
                  <p className="text-[0.65rem] text-foreground/40">Sets every balance back to 100. Voting history and past results are kept.</p>
                </div>
                <button
                  onClick={() => setConfirmResetTokens(true)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#FF6B00]/40 bg-[#FF6B00]/15 px-3 py-1.5 text-xs font-medium text-[#FF6B00] transition-colors hover:bg-[#FF6B00]/25"
                >
                  <Coins size={12} />
                  Reset to 100
                </button>
              </div>
              {resetTokensMsg && <p className="mt-1.5 text-[0.65rem] text-foreground/50">{resetTokensMsg}</p>}

              {/* Finals Day — an event-wide presentation switch, so it sits with
                  ALL IN rather than in the schedule sections. It changes only what
                  the PUBLIC pages show; the finals ring in the Matches panel is
                  always there to build regardless of this. */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                <div className="min-w-0">
                  <p className="text-xs text-foreground">Finals Day</p>
                  <p className="text-[0.65rem] text-foreground/40">
                    Switches the public site to the last day: the bracket opens on Finals, the
                    match list shows the Finals Day ring, and every public page gets a gold banner.
                    Doesn&rsquo;t move any match.
                  </p>
                </div>
                <button
                  disabled={finalsDayBusy}
                  onClick={toggleFinalsDay}
                  className={cn(
                    "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
                    finalsDay
                      ? "border-[#FFD700]/60 bg-[#FFD700]/25 text-[#FFD700]"
                      : "border-white/15 bg-white/5 text-foreground/50 hover:text-foreground/80",
                  )}
                >
                  {finalsDay ? "FINALS DAY: ON" : "FINALS DAY: OFF"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                <div className="min-w-0">
                  <p className="text-xs text-foreground">ALL IN mode</p>
                  <p className="text-[0.65rem] text-foreground/40">Removes the 50%-of-balance vote cap — players can stake their whole balance on one vote.</p>
                </div>
                <button
                  disabled={allInBusy}
                  onClick={toggleAllIn}
                  className={cn(
                    "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
                    allIn
                      ? "border-[#FF6B00]/60 bg-[#FF6B00]/25 text-[#FF6B00]"
                      : "border-white/15 bg-white/5 text-foreground/50 hover:text-foreground/80",
                  )}
                >
                  {allIn ? "ALL IN: ON" : "ALL IN: OFF"}
                </button>
              </div>

              {/* Begging — how broke a player has to be before the "Beg Rambo for
                  RamCoins" dial unlocks, and what a dead-centre dial pays. Both
                  live for everyone the moment they're saved. */}
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-xs text-foreground">Begging</p>
                <p className="text-[0.65rem] text-foreground/40">
                  Players can beg for RamCoin only while their balance is below the
                  threshold. Raise it to hand out the safety net sooner, lower it to make
                  begging a last resort. The bullseye is what a perfectly-timed dial pays.
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-1.5 text-[0.65rem] text-foreground/60">
                    Unlocks under
                    <input
                      type="number"
                      min={BEG_THRESHOLD_MIN}
                      max={BEG_THRESHOLD_MAX}
                      step={5}
                      value={begInput}
                      onChange={e => { setBegInput(e.target.value); setBegError(null); }}
                      className={cn(
                        "w-20 rounded-lg border bg-white/8 px-2 py-1.5 text-center text-xs text-foreground outline-none focus:border-white/30",
                        begThresholdValid ? "border-white/10" : "border-amber-400/50",
                      )}
                    />
                    RC
                  </label>
                  <label className="flex items-center gap-1.5 text-[0.65rem] text-foreground/60">
                    Bullseye pays
                    <input
                      type="number"
                      min={BEG_MAX_AWARD_MIN}
                      max={BEG_MAX_AWARD_MAX}
                      step={5}
                      value={begAwardInput}
                      onChange={e => { setBegAwardInput(e.target.value); setBegError(null); }}
                      className={cn(
                        "w-20 rounded-lg border bg-white/8 px-2 py-1.5 text-center text-xs text-foreground outline-none focus:border-white/30",
                        begMaxAwardValid ? "border-white/10" : "border-amber-400/50",
                      )}
                    />
                    RC
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleSaveBegLimits}
                      disabled={begSaving || !begDirty}
                      className="flex items-center gap-1.5 rounded-lg border border-[#FFD700]/40 bg-[#FFD700]/15 px-3 py-1.5 text-xs font-medium text-[#FFD700] transition-colors hover:bg-[#FFD700]/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Save size={12} />
                      {begSaving ? "Saving…" : "Save"}
                    </button>
                    <span
                      className={cn(
                        "text-[0.65rem] text-green-300 transition-opacity",
                        begFlash ? "opacity-100" : "opacity-0",
                      )}
                    >
                      Saved ✓
                    </span>
                  </div>
                </div>

                <p className="mt-1.5 text-[0.65rem] text-foreground/40">
                  Bullseye +{begPreviewAward} · band edge +{begEdgeAward} · miss +0. A beg
                  can&rsquo;t take anyone past {begCeiling} RamCoin (
                  {begPreviewThreshold} + {begPreviewAward}), so every eligible player can
                  still win the full bullseye.
                </p>
                {!begValid && (
                  <p className="mt-1 text-[0.65rem] text-amber-300/80">
                    {!begThresholdValid && `Threshold must be ${BEG_THRESHOLD_MIN}–${BEG_THRESHOLD_MAX}. `}
                    {!begMaxAwardValid && `Bullseye must be ${BEG_MAX_AWARD_MIN}–${BEG_MAX_AWARD_MAX}.`}
                  </p>
                )}
                {begError && <p className="mt-1 text-[0.65rem] text-red-300">{begError}</p>}
              </div>
            </div>

            {/* ── Reset All — kept last, most destructive ─────────────────── */}
            <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-3">
              <h3 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-red-300">
                <AlertTriangle size={13} />
                Reset All
              </h3>
              <p className="mb-2 text-[0.65rem] text-foreground/45">
                Clears both divisions&rsquo; brackets, schedules and exhibition matches, wipes all voting history, and resets every balance to 100. Special teams are kept. Can&rsquo;t be undone.
              </p>
              <button
                onClick={() => setConfirmResetAll(true)}
                className="w-full rounded-lg border border-red-500/60 bg-red-600 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-red-500"
              >
                Reset Everything
              </button>
            </div>
          </div>
        )}
      </div>

      {broadcastConfirmOpen && (
        <ConfirmDialog
          title="Send broadcast?"
          message={`Send this message to all ${broadcastCounts?.withPhone ?? 0} captains for an estimated $${estimateCostAud(broadcastCounts?.withPhone ?? 0, broadcastParts).toFixed(2)} AUD? This can't be undone.`}
          confirmLabel="Send"
          onConfirm={handleBroadcastSend}
          onCancel={() => setBroadcastConfirmOpen(false)}
        />
      )}

      {/* Post-import: offer to re-seed the CURRENT division's bracket */}
      {pendingAutoFill && (
        <ConfirmDialog
          wide
          title="Auto-fill teams again?"
          message={`Seeds imported. Reset the ${DIVISION_LABEL[division]} bracket and seed its Round 1 from the In-Bracket teams now? Every round's teams, scores, results and wildcard boxes are cleared first (exhibition matches are kept). Only the ${DIVISION_LABEL[division]} bracket is affected — switch divisions to auto-fill the other.`}
          confirmLabel="Auto Fill"
          onConfirm={() => { onAutoFill(autoFillMode); setPendingAutoFill(false); }}
          onCancel={() => setPendingAutoFill(false)}
        >
          <AutoFillModePicker value={autoFillMode} onChange={setAutoFillMode} />
        </ConfirmDialog>
      )}

      {confirmGrant && (
        <ConfirmDialog
          title={`Give everyone ${grantAmount} RamCoin?`}
          message={`Every player's balance goes up by ${grantAmount} RamCoin. Nobody's spot on the leaderboard changes, and voting history is kept. This can't be undone.`}
          confirmLabel={`Give ${grantAmount}`}
          onConfirm={handleGrantTokens}
          onCancel={() => setConfirmGrant(false)}
        />
      )}

      {confirmResetTokens && (
        <ConfirmDialog
          title="Reset all RamCoin?"
          message="Every player's balance is set back to 100 RamCoin. Voting history and past results are kept. This can't be undone."
          confirmLabel="Reset RamCoin"
          onConfirm={handleResetTokens}
          onCancel={() => setConfirmResetTokens(false)}
        />
      )}

      {confirmResetAll && (
        <ConfirmDialog
          title="Reset everything?"
          message="This clears every team, score, and result from BOTH divisions' brackets (Standards and Open) and resets their schedules to default order and times. All exhibition matches are deleted. Every player's balance resets to 100 and their entire voting history is permanently deleted. Special teams you've added are not affected. This can't be undone."
          confirmLabel="Reset All"
          onConfirm={() => { onResetAll(); setConfirmResetAll(false); }}
          onCancel={() => setConfirmResetAll(false)}
        />
      )}

      {testConfirmOpen && (
        <ConfirmDialog
          title="Send to this number list?"
          message={`Send this message to ${testNumbersCount} number${testNumbersCount === 1 ? "" : "s"} for an estimated $${testCostAud.toFixed(2)} AUD? This can't be undone.`}
          confirmLabel="Send"
          onConfirm={handleSendTest}
          onCancel={() => setTestConfirmOpen(false)}
        />
      )}
    </div>
  );
}
