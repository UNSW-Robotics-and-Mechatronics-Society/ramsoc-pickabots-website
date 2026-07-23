"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/cn";

import UserTypeStep, { type UserType } from "../onboarding/_components/UserTypeStep";
import DetailsForm from "../onboarding/_components/DetailsForm";
import ExtraFieldsStep from "../onboarding/_components/ExtraFieldsStep";
import TeamStep from "../onboarding/_components/TeamStep";
import { defaultExtraAnswers, type ExtraAnswers } from "../onboarding/_components/extraFields";
import type { OnboardingTeam, ProfileInput, TeamRole } from "@/lib/db/profiles";

import BegDial from "@/components/BegDial";
import TeamDetailsModal from "@/components/admin/TeamDetailsModal";
import PlayersPanel from "@/components/admin/PlayersPanel";
import Ring from "@/components/Ring";
import type { Match, Vote, VoteStandings } from "@/lib/types";
import { standingsFromMatch } from "@/lib/vote-pool";

// ─────────────────────────────────────────────────────────────────────────────
//  Mock fetch shim — installed once at module scope. Intercepts the handful of
//  endpoints the components in this gallery call, and passes everything else
//  through to the real window.fetch untouched.
// ─────────────────────────────────────────────────────────────────────────────

type Contact = { profileId: string; fullName: string; phone: string; role: "captain" | "member" };

const MOCK_CONTACTS: Contact[] = [
  { profileId: "a", fullName: "Dash Russell", phone: "0412 345 678", role: "captain" },
  { profileId: "b", fullName: "Alex Chen", phone: "0498 765 432", role: "member" },
  { profileId: "c", fullName: "Sam Lee", phone: "", role: "member" },
];

type MockPlayer = {
  id: string;
  displayName: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  tokens: number;
  onboarded: boolean;
  isSpectator: boolean;
  teamName: string | null;
  teamRole: "captain" | "member" | null;
  division: "standards" | "open" | null;
  extra: Record<string, unknown>;
  createdAt: string | null;
};

const MOCK_PLAYERS: MockPlayer[] = [
  {
    id: "p1",
    displayName: "Dash",
    fullName: "Dash Russell",
    email: "dash@example.com",
    phone: "0412 345 678",
    tokens: 42,
    onboarded: true,
    isSpectator: false,
    teamName: "Iron Fist",
    teamRole: "captain",
    division: "standards",
    extra: { shirt_size: "L" },
    createdAt: "2026-05-01T00:00:00.000Z",
  },
  {
    id: "p2",
    displayName: "Alex",
    fullName: "Alex Chen",
    email: "alex@example.com",
    phone: "0498 765 432",
    tokens: 18,
    onboarded: true,
    isSpectator: false,
    teamName: "Iron Fist",
    teamRole: "member",
    division: "standards",
    extra: { shirt_size: "M" },
    createdAt: "2026-05-02T00:00:00.000Z",
  },
  {
    id: "p3",
    displayName: "Sam",
    fullName: "Sam Lee",
    email: "sam@example.com",
    phone: null,
    tokens: 8,
    onboarded: true,
    isSpectator: false,
    teamName: "Spinner Rex",
    teamRole: "member",
    division: "standards",
    extra: {},
    createdAt: "2026-05-03T00:00:00.000Z",
  },
  {
    id: "p4",
    displayName: "Jamie",
    fullName: "Jamie Nguyen",
    email: "jamie@example.com",
    phone: "0400 111 222",
    tokens: 30,
    onboarded: true,
    isSpectator: true,
    teamName: null,
    teamRole: null,
    division: null,
    extra: {},
    createdAt: "2026-05-04T00:00:00.000Z",
  },
  {
    id: "p5",
    displayName: null,
    fullName: null,
    email: "newbie@example.com",
    phone: null,
    tokens: 4,
    onboarded: false,
    isSpectator: false,
    teamName: null,
    teamRole: null,
    division: null,
    extra: {},
    createdAt: "2026-05-05T00:00:00.000Z",
  },
];

type BegMockMode = "eligible" | "cooldown" | "spent";
/** Mutable holder so a UI control can flip the /api/beg response before opening
 *  BegDial (a const object property — the React Compiler lint forbids
 *  reassigning a module-level `let` from a component). */
const begMock: { mode: BegMockMode } = { mode: "eligible" };

function begState() {
  switch (begMock.mode) {
    case "cooldown":
      return {
        tokens: 4,
        threshold: 10,
        ceiling: 25,
        begsUsed: 1,
        begsAllowed: 2,
        cooldownRemaining: 2,
        eligible: false,
        reason: "cooldown" as const,
      };
    case "spent":
      return {
        tokens: 4,
        threshold: 10,
        ceiling: 25,
        begsUsed: 2,
        begsAllowed: 2,
        cooldownRemaining: null,
        eligible: false,
        reason: "no_begs_left" as const,
      };
    default:
      return {
        tokens: 4,
        threshold: 10,
        ceiling: 25,
        begsUsed: 0,
        begsAllowed: 2,
        cooldownRemaining: null,
        eligible: true,
        reason: "ok" as const,
      };
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

if (typeof window !== "undefined" && !(window as unknown as { __devGalleryFetchPatched?: boolean }).__devGalleryFetchPatched) {
  (window as unknown as { __devGalleryFetchPatched?: boolean }).__devGalleryFetchPatched = true;
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();

    // GET /api/admin/teams/{id}/contacts
    if (method === "GET" && /\/api\/admin\/teams\/[^/]+\/contacts$/.test(url)) {
      return jsonResponse({ contacts: MOCK_CONTACTS, sender: "RAMSOC", smsConfigured: true });
    }

    // POST /api/admin/sms
    if (method === "POST" && /\/api\/admin\/sms$/.test(url)) {
      let to: string[] = [];
      try {
        const body = JSON.parse((init?.body as string) ?? "{}");
        if (Array.isArray(body.to)) to = body.to;
      } catch {
        // ignore malformed body
      }
      return jsonResponse({
        results: to.map((num) => ({ to: num, ok: true, status: "sent" as const })),
        sender: "RAMSOC",
      });
    }

    // GET /api/admin/players
    if (method === "GET" && /\/api\/admin\/players$/.test(url)) {
      return jsonResponse({ players: MOCK_PLAYERS });
    }

    // PATCH/DELETE /api/admin/players/{id}
    if (/\/api\/admin\/players\/[^/]+$/.test(url)) {
      if (method === "PATCH") return jsonResponse({ ok: true, tokens: 999 });
      if (method === "DELETE") return jsonResponse({ ok: true });
    }

    // GET /api/beg
    if (method === "GET" && /\/api\/beg$/.test(url)) {
      return jsonResponse(begState());
    }

    // POST /api/beg
    if (method === "POST" && /\/api\/beg$/.test(url)) {
      return jsonResponse({ ok: true, awarded: 17, tokens: 21, begsUsed: 1 });
    }

    return realFetch(input, init);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Gallery data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_TEAMS: OnboardingTeam[] = [
  { id: "1", name: "Iron Fist", division: "standards" },
  { id: "2", name: "Spinner Rex", division: "standards" },
  { id: "3", name: "Annihilator", division: "open" },
  { id: "4", name: "Leviathan", division: "open" },
];

const MOCK_DETECTED_TEAM: { team: OnboardingTeam; role: TeamRole } = {
  team: MOCK_TEAMS[0],
  role: "captain",
};

function makeMatch(overrides: Partial<Match>): Match {
  return {
    id: "m1",
    comp_type: "standard",
    is_bossbot: false,
    left_name: "Iron Fist",
    left_color: "#1a6cff",
    left_shape: "wedge",
    right_name: "Spinner Rex",
    right_color: "#ff2d2d",
    right_shape: "spinner",
    is_active: true,
    voting_open: true,
    winner_side: null,
    created_at: "",
    pool_left: 0,
    pool_right: 0,
    votes_left: 0,
    votes_right: 0,
    ...overrides,
  };
}

const MOCK_MATCH_1 = makeMatch({
  id: "match-1",
  left_name: "Iron Fist",
  right_name: "Spinner Rex",
  pool_left: 120,
  pool_right: 80,
  votes_left: 14,
  votes_right: 9,
});

const MOCK_MATCH_2 = makeMatch({
  id: "match-2",
  comp_type: "open",
  left_name: "Annihilator",
  left_color: "#4cff00",
  left_shape: "hammer",
  right_name: "Leviathan",
  right_color: "#9B30FF",
  right_shape: "flipper",
  pool_left: 40,
  pool_right: 160,
  votes_left: 5,
  votes_right: 21,
});

const SECTIONS = [
  { id: "onboarding", label: "Onboarding" },
  { id: "beg-dial", label: "Beg dial" },
  { id: "team-sms", label: "Team SMS" },
  { id: "players", label: "Players panel" },
  { id: "ring", label: "Live odds" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
//  Small readout helper
// ─────────────────────────────────────────────────────────────────────────────

function useLog(cap = 8) {
  const [entries, setEntries] = useState<string[]>([]);
  function log(msg: string) {
    setEntries((prev) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...prev].slice(0, cap));
  }
  return { entries, log };
}

function Readout({ entries }: { entries: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[0.7rem] text-foreground/70">
      <div className="mb-1 text-[0.6rem] uppercase tracking-[0.2em] text-foreground/40">
        Last action
      </div>
      {entries.length === 0 ? (
        <div className="text-foreground/30">Nothing yet — interact with the component above.</div>
      ) : (
        <ul className="space-y-0.5">
          {entries.map((e, i) => (
            <li key={i} className="truncate">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4 scroll-mt-24">
      <h2 id={`${id}-heading`} className="font-display text-xl text-[#FFD700]">
        {title}
      </h2>
      <p className="mt-1 text-sm text-foreground/50">{description}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main gallery
// ─────────────────────────────────────────────────────────────────────────────

export default function DevGallery() {
  // Client-only render: several showcased components use Math.random()/dynamic
  // content, which would otherwise cause SSR hydration mismatches on this page.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background px-4 pb-24 pt-6 text-foreground">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <h1 className="font-display text-3xl text-[#FF6B00]" style={{ textShadow: "0 0 20px rgba(255,107,0,0.4)" }}>
            Component Gallery — DEV
          </h1>
          <p className="mt-1 text-sm text-foreground/50">
            Mock data only — no auth/DB. This route 404s in production.
          </p>
        </header>

        <nav className="glass sticky top-3 z-30 mb-8 flex flex-wrap gap-1.5 rounded-2xl p-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="flex flex-col gap-14">
          <OnboardingSection />
          <BegDialSection />
          <TeamSmsSection />
          <PlayersSection />
          <RingSection />
        </div>
      </div>
    </div>
  );
}

// ─── 1. Onboarding steps ────────────────────────────────────────────────────

function OnboardingSection() {
  const { entries, log } = useLog();
  const [lastUserType, setLastUserType] = useState<UserType | null>(null);
  const [detailsUserType, setDetailsUserType] = useState<UserType>("unsw");
  const [detailsSubmitting, setDetailsSubmitting] = useState(false);

  return (
    <section id="onboarding">
      <SectionHeading
        id="onboarding"
        title="Onboarding steps"
        description="The four screens a new user walks through after signing in: who they are, their details, pickabots-specific extras, and their team."
      />

      <div className="flex flex-col gap-6">
        {/* UserTypeStep */}
        <div className="glass rounded-2xl p-5">
          <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-foreground/40">UserTypeStep</h3>
          <UserTypeStep
            onSelect={(type) => {
              setLastUserType(type);
              setDetailsUserType(type);
              log(`UserTypeStep.onSelect(${type})`);
            }}
          />
          <p className="mt-3 text-xs text-foreground/50">
            Last selected: <span className="text-foreground">{lastUserType ?? "—"}</span>
          </p>
        </div>

        {/* DetailsForm */}
        <div className="glass rounded-2xl p-5">
          <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-foreground/40">DetailsForm</h3>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {(["unsw", "other_uni", "high_school"] as UserType[]).map((t) => (
              <button
                key={t}
                onClick={() => setDetailsUserType(t)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                  detailsUserType === t
                    ? "border-[#FF6B00]/50 bg-[#FF6B00]/15 text-[#FF6B00]"
                    : "border-white/10 bg-white/5 text-foreground/60 hover:bg-white/10",
                )}
              >
                {t}
              </button>
            ))}
            <button
              onClick={() => setDetailsSubmitting((v) => !v)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground/60 transition-colors hover:bg-white/10"
            >
              submitting: {String(detailsSubmitting)}
            </button>
          </div>
          <DetailsForm
            key={detailsUserType}
            userType={detailsUserType}
            submitting={detailsSubmitting}
            onComplete={(input: ProfileInput) => log(`DetailsForm.onComplete(${input.full_name || "(no name)"})`)}
          />
        </div>

        {/* ExtraFieldsStep */}
        <div className="glass rounded-2xl p-5">
          <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-foreground/40">ExtraFieldsStep</h3>
          <ExtraFieldsStep
            initial={defaultExtraAnswers()}
            onComplete={(answers: ExtraAnswers) => log(`ExtraFieldsStep.onComplete(${JSON.stringify(answers)})`)}
          />
        </div>

        {/* TeamStep — confirm flow */}
        <div className="glass rounded-2xl p-5">
          <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-foreground/40">
            TeamStep — detected team (confirm flow)
          </h3>
          <TeamStep
            teams={MOCK_TEAMS}
            detectedTeam={MOCK_DETECTED_TEAM}
            onSubmit={(teamId) => log(`TeamStep(confirm).onSubmit(${teamId ?? "null"})`)}
          />
        </div>

        {/* TeamStep — pick flow */}
        <div className="glass rounded-2xl p-5">
          <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-foreground/40">
            TeamStep — no detected team (pick flow)
          </h3>
          <TeamStep
            teams={MOCK_TEAMS}
            detectedTeam={null}
            onSubmit={(teamId) => log(`TeamStep(pick).onSubmit(${teamId ?? "null"})`)}
          />
        </div>

        <Readout entries={entries} />
      </div>
    </section>
  );
}

// ─── 2. Beg dial ────────────────────────────────────────────────────────────

function BegDialSection() {
  const { entries, log } = useLog();
  const [begOpen, setBegOpen] = useState(false);
  const [mode, setMode] = useState<BegMockMode>("eligible");

  function openWith(next: BegMockMode) {
    // Dev-only: flip the mocked /api/beg response the fetch shim will return.
    // eslint-disable-next-line
    begMock.mode = next;
    setMode(next);
    setBegOpen(true);
    log(`Opened BegDial in "${next}" mode`);
  }

  return (
    <section id="beg-dial">
      <SectionHeading
        id="beg-dial"
        title="Beg dial"
        description="The timing-based mini-game users play to beg for extra tokens. Pick a mock state below, then open it."
      />
      <div className="glass rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap gap-1.5">
          {(["eligible", "cooldown", "spent"] as const).map((m) => (
            <button
              key={m}
              onClick={() => openWith(m)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                mode === m
                  ? "border-[#FF6B00]/50 bg-[#FF6B00]/15 text-[#FF6B00]"
                  : "border-white/10 bg-white/5 text-foreground/60 hover:bg-white/10",
              )}
            >
              Open ({m})
            </button>
          ))}
        </div>
        <Readout entries={entries} />
      </div>

      {begOpen && (
        <BegDial
          onClose={() => {
            setBegOpen(false);
            log("BegDial.onClose()");
          }}
          onAwarded={(tokens) => log(`BegDial.onAwarded(${tokens})`)}
        />
      )}
    </section>
  );
}

// ─── 3. Team SMS modal ──────────────────────────────────────────────────────

function TeamSmsSection() {
  const [open, setOpen] = useState(false);

  return (
    <section id="team-sms">
      <SectionHeading
        id="team-sms"
        title="Team SMS"
        description="Admin modal for texting a team's contacts — used to ping captains that they're up next."
      />
      <div className="glass rounded-2xl p-5">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-[#FF6B00]/40 bg-[#FF6B00]/15 px-4 py-2 text-xs font-medium text-[#FF6B00] transition-colors hover:bg-[#FF6B00]/25"
        >
          Open Team Details / SMS modal
        </button>
      </div>

      {open && (
        <TeamDetailsModal
          teamId="1"
          teamName="Iron Fist"
          division="standards"
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

// ─── 4. Players panel ───────────────────────────────────────────────────────

function PlayersSection() {
  return (
    <section id="players">
      <SectionHeading
        id="players"
        title="Players panel"
        description="Admin roster: search/filter, per-player token boosts, kicks, and CSV export. Fully self-contained — no external state to wire up."
      />
      <div className="glass h-[600px] overflow-hidden rounded-2xl border border-white/10">
        <PlayersPanel />
      </div>
    </section>
  );
}

// ─── 5. Live odds (Ring) ────────────────────────────────────────────────────

function RingSection() {
  const { entries, log } = useLog();
  const [votes, setVotes] = useState<Record<string, Vote | null>>({
    [MOCK_MATCH_1.id]: null,
    [MOCK_MATCH_2.id]: null,
  });

  function makeHandlers(match: Match) {
    const standings: VoteStandings = standingsFromMatch(match);
    return {
      standings,
      onVote: (side: "left" | "right") => {
        const botName = side === "left" ? match.left_name : match.right_name;
        setVotes((prev) => ({
          ...prev,
          [match.id]: { id: `v-${match.id}`, match_id: match.id, side, amount: 10, botName },
        }));
        log(`Ring.onVote(matchId=${match.id}, side=${side}, botName=${botName}, compType=${match.comp_type})`);
      },
      onUndo: () => {
        setVotes((prev) => ({ ...prev, [match.id]: null }));
        log(`Ring.onUndo(matchId=${match.id})`);
      },
    };
  }

  const h1 = makeHandlers(MOCK_MATCH_1);
  const h2 = makeHandlers(MOCK_MATCH_2);

  return (
    <section id="ring">
      <SectionHeading
        id="ring"
        title="Live odds (Ring)"
        description="The bracket-side match card showing live pari-mutuel odds. Two mock matches with different pool splits so the odds bars visibly differ."
      />
      <div className="flex flex-col gap-4">
        <Ring
          match={MOCK_MATCH_1}
          vote={votes[MOCK_MATCH_1.id]}
          standings={h1.standings}
          votingOpen
          onVote={h1.onVote}
          onUndo={h1.onUndo}
        />
        <Ring
          match={MOCK_MATCH_2}
          vote={votes[MOCK_MATCH_2.id]}
          standings={h2.standings}
          votingOpen
          onVote={h2.onVote}
          onUndo={h2.onUndo}
        />
        <Readout entries={entries} />
      </div>
    </section>
  );
}
