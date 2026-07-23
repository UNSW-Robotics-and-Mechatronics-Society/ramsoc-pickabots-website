"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Phone, Send, X } from "lucide-react";
import { type Division } from "@/lib/mock-data";
import { cn } from "@/lib/cn";
import { renderSmsTemplate, DEFAULT_SMS_UP_NEXT, DEFAULT_SMS_LOCATION } from "@/lib/sms-template";

type Contact = {
  profileId: string;
  fullName: string;
  phone: string;
  role: "captain" | "member";
};

type ContactsResponse = {
  contacts: Contact[];
  sender: string;
  smsConfigured: boolean;
  upNextTemplate: string;
  location: string;
};

type SmsResult = {
  to: string;
  ok: boolean;
  status: "sent" | "failed" | "skipped";
  error?: string;
};

type SmsResponse = {
  results: SmsResult[];
  sender: string;
};

type Props = {
  teamId: string;
  teamName: string;
  division: Division;
  onClose: () => void;
};

function divisionLabel(division: Division): string {
  return division === "standards" ? "Standard" : "Open";
}

export default function TeamDetailsModal({ teamId, teamName, division, onClose }: Props) {
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [contacts, setContacts]         = useState<Contact[]>([]);
  const [sender, setSender]             = useState<string>("");
  const [smsConfigured, setSmsConfigured] = useState(true);
  const [upNextTemplate, setUpNextTemplate] = useState<string>(DEFAULT_SMS_UP_NEXT);
  const [location, setLocation] = useState<string>(DEFAULT_SMS_LOCATION);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage]   = useState("");
  const [sending, setSending]   = useState(false);
  const [results, setResults]   = useState<SmsResult[] | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/teams/${teamId}/contacts`);
        if (!res.ok) throw new Error(`Failed to load contacts (${res.status})`);
        const data: ContactsResponse = await res.json();
        if (cancelled) return;
        setContacts(data.contacts);
        setSender(data.sender);
        setSmsConfigured(data.smsConfigured);
        setUpNextTemplate(data.upNextTemplate ?? DEFAULT_SMS_UP_NEXT);
        setLocation(data.location ?? DEFAULT_SMS_LOCATION);
        // default selection: captains with a phone number
        setSelected(
          new Set(
            data.contacts
              .filter(c => c.role === "captain" && c.phone)
              .map(c => c.profileId),
          ),
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load contacts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [teamId]);

  const withPhone = useMemo(() => contacts.filter(c => c.phone), [contacts]);
  const captains  = useMemo(() => withPhone.filter(c => c.role === "captain"), [withPhone]);

  function selectAll() {
    setSelected(new Set(withPhone.map(c => c.profileId)));
  }
  function selectCaptainsOnly() {
    setSelected(new Set(captains.map(c => c.profileId)));
  }
  function clearSelection() {
    setSelected(new Set());
  }
  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectedPhones = useMemo(
    () => withPhone.filter(c => selected.has(c.profileId)).map(c => c.phone),
    [withPhone, selected],
  );

  const charCount = message.length;
  const parts = charCount === 0 ? 0 : Math.ceil(charCount / 160);

  async function sendSms(to: string[], body: string) {
    if (!to.length || !body.trim()) return;
    setSending(true);
    setSendError(null);
    setResults(null);
    try {
      const res = await fetch("/api/admin/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, body, teamId, kind: "manual" }),
      });
      const data: SmsResponse | { error: string } = await res.json();
      if (!res.ok || !("results" in data)) {
        throw new Error("error" in data ? data.error : `Send failed (${res.status})`);
      }
      setResults(data.results);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send SMS");
    } finally {
      setSending(false);
    }
  }

  function handleSend() {
    sendSms(selectedPhones, message);
  }

  function upNextMessage(name: string, div: Division): string {
    return renderSmsTemplate(upNextTemplate, { team: name, division: div, location });
  }

  function handleTextCaptainsUpNext() {
    const text = upNextMessage(teamName, division);
    setMessage(text);
    sendSms(captains.map(c => c.phone), text);
  }

  function fillUpNext() {
    setMessage(upNextMessage(teamName, division));
  }

  const sendDisabled = sending || selectedPhones.length === 0 || message.trim().length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-strong flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-white/10 p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-foreground">{teamName}</h2>
              <span className="shrink-0 rounded-lg border border-[#FF6B00]/40 bg-[#FF6B00]/15 px-2 py-0.5 text-[0.65rem] font-medium text-[#FF6B00]">
                {divisionLabel(division)}
              </span>
            </div>
            {sender && (
              <p className="mt-1 text-[0.65rem] text-foreground/50">Texts sent as {sender}</p>
            )}
            {!smsConfigured && (
              <span className="mt-2 inline-block rounded-lg border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-[0.65rem] text-amber-300">
                SMS not configured — sends will be skipped
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 text-foreground/60 transition-colors hover:bg-white/10 hover:text-foreground"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="py-8 text-center text-xs text-foreground/50">Loading contacts…</p>
          ) : error ? (
            <p className="py-8 text-center text-xs text-red-300">{error}</p>
          ) : (
            <>
              {/* Toolbar */}
              <div className="mb-2 flex flex-wrap gap-1.5">
                <button
                  onClick={selectAll}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[0.65rem] text-foreground/70 transition-colors hover:bg-white/10"
                >
                  Select all
                </button>
                <button
                  onClick={selectCaptainsOnly}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[0.65rem] text-foreground/70 transition-colors hover:bg-white/10"
                >
                  Captains only
                </button>
                <button
                  onClick={clearSelection}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[0.65rem] text-foreground/70 transition-colors hover:bg-white/10"
                >
                  Clear
                </button>
              </div>

              {/* Member list */}
              <div className="mb-4 space-y-1.5">
                {contacts.length === 0 && (
                  <p className="text-xs text-foreground/40">No contacts found for this team.</p>
                )}
                {contacts.map(c => {
                  const hasPhone = Boolean(c.phone);
                  const checked = selected.has(c.profileId);
                  return (
                    <div
                      key={c.profileId}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2"
                    >
                      {hasPhone ? (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(c.profileId)}
                          className="size-3.5 shrink-0 accent-[#FF6B00]"
                        />
                      ) : (
                        <span className="size-3.5 shrink-0" />
                      )}

                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {c.fullName}
                      </span>

                      <span
                        className={cn(
                          "shrink-0 rounded-lg border px-1.5 py-0.5 text-[0.6rem] font-medium",
                          c.role === "captain"
                            ? "border-[#FF6B00]/40 bg-[#FF6B00]/15 text-[#FF6B00]"
                            : "border-white/10 bg-white/5 text-foreground/40",
                        )}
                      >
                        {c.role === "captain" ? "Captain" : "Member"}
                      </span>

                      {hasPhone ? (
                        <>
                          <span className="shrink-0 text-[0.65rem] tabular-nums text-foreground/50">
                            {c.phone}
                          </span>
                          <a
                            href={`tel:${c.phone}`}
                            className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/8 px-1.5 py-0.5 text-[0.6rem] text-foreground/60 transition-colors hover:text-foreground"
                          >
                            <Phone size={10} strokeWidth={2} />
                          </a>
                        </>
                      ) : (
                        <span className="shrink-0 text-[0.6rem] italic text-foreground/30">no number</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Message composer */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[0.65rem] uppercase tracking-wider text-foreground/40">Message</span>
                  <button
                    onClick={fillUpNext}
                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[0.6rem] text-foreground/70 transition-colors hover:bg-white/10"
                  >
                    Up next
                  </button>
                </div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Type a message to send…"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-white/10 bg-white/8 px-2 py-1.5 text-xs text-foreground placeholder:text-foreground/30 outline-none focus:border-white/30"
                />
                <p className="text-[0.6rem] text-foreground/35">
                  {charCount} chars{parts > 1 ? ` · ${parts} SMS parts` : ""}
                </p>
              </div>

              {/* Send results */}
              {sendError && (
                <p className="mt-3 text-[0.65rem] text-red-300">{sendError}</p>
              )}
              {results && (
                <div className="mt-3 space-y-1 rounded-lg border border-white/10 bg-white/5 p-2">
                  {results.map((r, i) => (
                    <div key={`${r.to}-${i}`} className="flex items-center gap-1.5 text-[0.65rem]">
                      {r.status === "sent" ? (
                        <Check size={11} className="shrink-0 text-green-400" />
                      ) : r.status === "failed" ? (
                        <X size={11} className="shrink-0 text-red-400" />
                      ) : (
                        <span className="shrink-0 text-foreground/40">—</span>
                      )}
                      <span className="tabular-nums text-foreground/70">{r.to}</span>
                      <span
                        className={cn(
                          "text-foreground/40",
                          r.status === "sent" && "text-green-300",
                          r.status === "failed" && "text-red-300",
                        )}
                      >
                        {r.status}{r.error ? ` — ${r.error}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {!loading && !error && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/10 p-3">
            <button
              onClick={handleTextCaptainsUpNext}
              disabled={sending || captains.length === 0}
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Text captains: up next
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-white/10"
            >
              Close
            </button>
            <button
              onClick={handleSend}
              disabled={sendDisabled}
              className="flex items-center gap-1.5 rounded-lg border border-[#FF6B00]/40 bg-[#FF6B00]/20 px-3 py-1.5 text-xs font-medium text-[#FF6B00] transition-colors hover:bg-[#FF6B00]/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={12} />
              Send SMS
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
