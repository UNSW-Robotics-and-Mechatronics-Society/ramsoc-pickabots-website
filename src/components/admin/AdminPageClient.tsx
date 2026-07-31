"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type BracketMatch, type Division, type Team, type TeamCount,
  generateDoubleElimBracket, transferBracket, completeRound1Byes,
} from "@/lib/mock-data";
import {
  type ConcurrentRings, type MatchSchedule, type ExhibitionSchedule, type FinalsSchedule,
  generateSchedule, applyScheduleStatus, applyFinalsScheduleStatus, rollSchedule,
  rollExhibitionSchedule, rollFinalsSchedule, START_MINUTE, MAX_RINGS,
} from "@/lib/schedule";
import {
  type SeedConflict, type AutoFillMode, computeSeedConflicts, describeSeedConflicts, round1Pairs,
} from "@/lib/seeds";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { cn } from "@/lib/cn";
import { type PanelId } from "./AdminPanelContext";
import PanelGrid        from "./PanelGrid";
import TeamList        from "./TeamList";
import AdminBracket    from "./AdminBracket";
import MatchesPanel    from "./MatchesPanel";
import ConfirmDialog   from "./ConfirmDialog";
import AlertDialog     from "./AlertDialog";
import PlayersPanel    from "./PlayersPanel";
import SettingsPanel   from "./SettingsPanel";

// ── eliminated teams (only LB losers; WB losers still alive in LB) ────────────
function computeEliminated(matches: BracketMatch[]): Set<string> {
  const out = new Set<string>();
  for (const m of matches) {
    if (m.status !== 'completed' || m.side !== 'losers') continue;
    const aWon = m.slotA.score >= m.targetScore;
    const bWon = m.slotB.score >= m.targetScore;
    if (aWon && m.slotB.teamName) out.add(m.slotB.teamName);
    if (bWon && m.slotA.teamName) out.add(m.slotA.teamName);
  }
  return out;
}

const TEAM_COUNTS: TeamCount[] = [4, 8, 16, 32, 64];

const DIVISION_LABEL: Record<Division, string> = { standards: "Standards", open: "Open" };

const ALL_DIVISIONS: Division[] = ['standards', 'open'];

const SAVE_DEBOUNCE_MS = 500;
// Team + special-team data is refetched when admin_data_signal is bumped (see
// 0023_admin_data_signal.sql). Short coalescing window — one admin action can
// write several of those tables in quick succession.
const ADMIN_DATA_SETTLE_MS = 500;
// Only used when Realtime isn't available at all (no anon key configured).
const ADMIN_DATA_FALLBACK_POLL_MS = 30_000;
// Coalescing window for realtime pulls. One save writes many rows, and every
// admin (including the writer) hears about all of them.
const REALTIME_SETTLE_MS = 700;

type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

// The per-team fields this page can edit — everything else on a Team (id, name,
// division) comes from the shared registration table and isn't editable here.
// Merging a remote team list is done field by field over these, matching the
// per-field granularity the PATCH endpoint already saves at.
const TEAM_FIELDS = ['seed', 'comment', 'present', 'inBracket', 'points'] as const;
type TeamField = typeof TEAM_FIELDS[number];

// Same idea for special teams. `name` IS editable here (unlike regular teams,
// which own their name in the shared registration table), and so are the contact
// fields — so every one of them is merged field by field.
const SPECIAL_TEAM_FIELDS = ['name', 'email', 'phone', 'notes', 'category', 'present', 'inBracket'] as const;
type SpecialTeamField = typeof SPECIAL_TEAM_FIELDS[number];

// Body of a PUT /api/admin/bracket write. Mirrors BracketSave in the
// server-only lib/db/bracket module, duplicated here for the same reason
// SpecialTeam is (see below) rather than importing across that boundary.
type BracketSavePayload = {
  matches?: BracketMatch[];
  replaceAll?: boolean;
  /** Partial: only the divisions being resized are sent. */
  teamCounts?: Partial<Record<Division, TeamCount>>;
  schedules?: Record<Division, MatchSchedule>;
  exhibitionSchedule?: ExhibitionSchedule;
  finalsSchedule?: FinalsSchedule;
  clearCaptainNotified?: Division[];
};

// ── change detection ─────────────────────────────────────────────────────────
// Explicit field-by-field keys rather than JSON.stringify: these values make a
// round trip through JSONB (which does not preserve key order) and through
// object spreads, so stringify would report spurious differences — and a
// spurious difference here means a save, whose echo triggers a pull, which
// reports another difference. Listing the fields keeps that loop impossible.
//
// The U+0001 separator matters: joined with '', a name running straight into a
// score would let ("Alpha", 12) and ("Alpha1", 2) share a key, and a rename
// between those two would never register as an edit to save.
function matchKey(m: BracketMatch): string {
  return [
    m.id, m.division, m.side, m.round, m.matchNumber,
    m.slotA.teamName, m.slotA.score, m.slotB.teamName, m.slotB.score,
    m.targetScore, m.status, m.votingOpen,
  ].join('');
}

// The pin marker is part of the key: re-typing a slot's existing time changes
// nothing but `pinned`, and that still has to reach the database — otherwise
// the slot stays unpinned and the next read-time roll moves it again.
function ringsKey(rings: { matchId: string; startMinute: number; pinned?: boolean }[][]): string {
  return rings.map(r => r.map(e => `${e.matchId}@${e.startMinute}${e.pinned ? '!' : ''}`).join(',')).join('|');
}

function schedulesKey(s: Record<Division, MatchSchedule>): string {
  return ALL_DIVISIONS
    .map(d => [s[d].concurrentRings, s[d].matchMinutes, s[d].gapMinutes, s[d].autoFillMode ?? '', ringsKey(s[d].rings)].join(':'))
    .join('||');
}

function exhibitionKey(e: ExhibitionSchedule): string {
  return [e.matchMinutes, e.gapMinutes, ringsKey(e.rings)].join(':');
}

/** Same shape as exhibitionKey — the Finals Day ring is stored alongside it. */
function finalsKey(f: FinalsSchedule): string {
  return [f.matchMinutes, f.gapMinutes, ringsKey(f.rings)].join(':');
}

// A single parsed row of the "Import seeds" CSV. Shared shape between the
// Settings panel (which parses the file) and the import handler here (which
// matches names against the team list).
export type SeedImportRow = { name: string; division: Division; seed: number };
/**
 * `duplicates` non-empty means the import was REJECTED whole (imported: 0):
 * applying it would have left two teams in a division sharing a seed, which
 * Auto Fill can't order. The caller lists the clashes.
 */
export type SeedImportResult = {
  imported: number;
  unmatched: SeedImportRow[];
  duplicates?: { division: Division; seed: number; names: string[] }[];
};

/** SeedConflict → the flatter shape the Settings panel renders. */
function toDuplicates(conflicts: SeedConflict[]): NonNullable<SeedImportResult['duplicates']> {
  return conflicts.map(c => ({ division: c.division, seed: c.seed, names: c.teams.map(t => t.name) }));
}

type InitialBracket = {
  matches: BracketMatch[];
  /** Per division — the two brackets can be different sizes. */
  teamCounts: Record<Division, TeamCount>;
  schedules: Record<Division, MatchSchedule>;
  exhibitionSchedule: ExhibitionSchedule;
  /** The single shared Finals Day ring — see FinalsSchedule. */
  finalsSchedule: FinalsSchedule;
};

/** The pieces of bracket state a save covers. Same shape as InitialBracket
 *  — named separately because it's passed around as a point-in-time snapshot. */
type BracketSnapshot = InitialBracket;

// One-time/exhibition team, kept in its own table — never division-scoped,
// never fed into the bracket. Duplicated locally rather than imported from
// the server-only db module (see src/lib/db/specialTeams.ts).
type SpecialTeamCategory = 'std' | 'open' | 'boss' | 'other';
type SpecialTeam = {
  id: string; name: string; email: string; phone: string; notes: string;
  category: SpecialTeamCategory; present: boolean; inBracket: boolean;
};
type SpecialTeamInput = { name: string; email: string; phone: string; notes: string; category: SpecialTeamCategory };
type SpecialTeamPatch = Partial<Omit<SpecialTeam, 'id'>>;

type Props = {
  division: Division;
  initialTeams: Team[];
  initialSpecialTeams: SpecialTeam[];
  initialBracket: InitialBracket;
};

export default function AdminPageClient({ division, initialTeams, initialSpecialTeams, initialBracket }: Props) {
  const [teams,        setTeams]     = useState<Team[]>(initialTeams);
  const [specialTeams, setSpecialTeams] = useState<SpecialTeam[]>(initialSpecialTeams);
  const [matches,      setMatches]   = useState<BracketMatch[]>(initialBracket.matches);
  const [teamCounts,   setTeamCounts] = useState<Record<Division, TeamCount>>(initialBracket.teamCounts);
  // A pending resize is scoped to the division it was requested for — resizing
  // Standards no longer implies anything about Open.
  const [pendingCount, setPending]   = useState<{ division: Division; n: TeamCount } | null>(null);
  // Blocking problems worth interrupting for: Auto Fill refusing to run (too
  // many in-bracket teams, or duplicate seeds) and a team change the server
  // rejected. Held here rather than at the call sites — Auto Fill alone has two
  // of them (the bracket panel's button and the Settings panel's post-import
  // prompt).
  const [errorDialog, setErrorDialog] = useState<{ title: string; message: string } | null>(null);
  const [schedules,    setSchedules] = useState<Record<Division, MatchSchedule>>(initialBracket.schedules);
  const [exhibitionSchedule, setExhibitionSchedule] = useState<ExhibitionSchedule>(initialBracket.exhibitionSchedule);
  const [finalsSchedule, setFinalsSchedule] = useState<FinalsSchedule>(initialBracket.finalsSchedule);

  // ── save pipeline ────────────────────────────────────────────────────────────
  // Saves are DIFFED, not wholesale: an ordinary edit sends only the match rows
  // that actually changed, so two admins editing different matches never
  // overwrite each other (the old whole-state PUT meant the last writer won,
  // clobbering everything the other had entered). Whole-bracket operations —
  // auto-fill, resize, reset-all — set pendingFull instead and send everything
  // with replaceAll, which is the only mode allowed to delete rows.
  //
  // `saveStatus` drives the badge in the corner: a failed save used to be a
  // console.error nobody saw, so scores could sit on screen having never
  // reached the database.
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [saveError, setSaveError]   = useState<string | null>(null);

  // Mirror of the current state, so the saver and the realtime merge always read
  // the latest values instead of whatever a stale closure captured.
  const latest = useRef({ matches, teamCounts, schedules, exhibitionSchedule, finalsSchedule });
  latest.current = { matches, teamCounts, schedules, exhibitionSchedule, finalsSchedule };

  // What we believe the server currently holds — the baseline every diff is
  // taken against. Updated on a successful save and when a remote change is
  // pulled in.
  const saved = useRef({
    matchKeys: new Map(initialBracket.matches.map(m => [m.id, matchKey(m)] as const)),
    teamCounts: { ...initialBracket.teamCounts },
    schedulesKey: schedulesKey(initialBracket.schedules),
    exhibitionKey: exhibitionKey(initialBracket.exhibitionSchedule),
    finalsKey: finalsKey(initialBracket.finalsSchedule),
  });

  const pendingFull = useRef<{ clearCaptainNotified?: Division[] } | null>(null);
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight    = useRef(false);
  const retries     = useRef(0);
  const isFirstRender = useRef(true);

  /**
   * Match rows in `snapshot` whose value differs from the last-saved baseline.
   * Takes the snapshot explicitly so the render path can pass the current state
   * variables while the async saver passes latest.current.
   */
  function dirtyMatchIds(snapshot: BracketSnapshot): Set<string> {
    const out = new Set<string>();
    for (const m of snapshot.matches) {
      if (saved.current.matchKeys.get(m.id) !== matchKey(m)) out.add(m.id);
    }
    return out;
  }

  /** Divisions whose bracket size differs from the saved baseline. */
  function resizedDivisions(snapshot: BracketSnapshot): Division[] {
    return ALL_DIVISIONS.filter(d => snapshot.teamCounts[d] !== saved.current.teamCounts[d]);
  }

  function hasUnsavedWork(snapshot: BracketSnapshot): boolean {
    return pendingFull.current !== null
      || dirtyMatchIds(snapshot).size > 0
      || resizedDivisions(snapshot).length > 0
      || schedulesKey(snapshot.schedules) !== saved.current.schedulesKey
      || exhibitionKey(snapshot.exhibitionSchedule) !== saved.current.exhibitionKey
      || finalsKey(snapshot.finalsSchedule) !== saved.current.finalsKey;
  }

  function scheduleSave(delay = SAVE_DEBOUNCE_MS) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveTimer.current = null; void flushSave(); }, delay);
  }

  async function flushSave(): Promise<void> {
    // One request at a time, so writes can't land out of order.
    if (inFlight.current) { scheduleSave(200); return; }

    const cur  = latest.current;
    const full = pendingFull.current;

    let body: BracketSavePayload;
    if (full) {
      body = {
        matches: cur.matches,
        replaceAll: true,
        teamCounts: cur.teamCounts,
        schedules: cur.schedules,
        exhibitionSchedule: cur.exhibitionSchedule,
        finalsSchedule: cur.finalsSchedule,
        ...(full.clearCaptainNotified ? { clearCaptainNotified: full.clearCaptainNotified } : {}),
      };
    } else {
      const dirty = dirtyMatchIds(cur);
      const resized           = resizedDivisions(cur);
      const schedulesChanged  = schedulesKey(cur.schedules) !== saved.current.schedulesKey;
      const exhibitionChanged = exhibitionKey(cur.exhibitionSchedule) !== saved.current.exhibitionKey;
      const finalsChanged     = finalsKey(cur.finalsSchedule) !== saved.current.finalsKey;
      if (dirty.size === 0 && resized.length === 0 && !schedulesChanged && !exhibitionChanged && !finalsChanged) {
        setSaveStatus('saved');
        return;
      }
      body = {
        ...(dirty.size > 0 ? { matches: cur.matches.filter(m => dirty.has(m.id)) } : {}),
        // Only the resized division's size goes out, so a concurrent admin
        // resizing the other division isn't overwritten.
        ...(resized.length > 0
          ? { teamCounts: Object.fromEntries(resized.map(d => [d, cur.teamCounts[d]])) }
          : {}),
        // Schedules are one JSON blob per division, so they can only be sent
        // whole — ring/time edits stay last-write-wins at division granularity.
        // The exhibition and finals copies ride along because they're mirrored
        // into the same rows — sending schedules without them would blank them.
        ...(schedulesChanged || exhibitionChanged || finalsChanged
          ? {
              schedules: cur.schedules,
              exhibitionSchedule: cur.exhibitionSchedule,
              finalsSchedule: cur.finalsSchedule,
            }
          : {}),
      };
    }

    inFlight.current = true;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/admin/bracket', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);

      // Baseline advances only for what this request actually carried; anything
      // edited while it was in flight stays dirty and goes out next time.
      if (body.matches) {
        for (const m of body.matches) saved.current.matchKeys.set(m.id, matchKey(m));
      }
      if (body.replaceAll && body.matches) {
        const sent = new Set(body.matches.map(m => m.id));
        for (const id of [...saved.current.matchKeys.keys()]) if (!sent.has(id)) saved.current.matchKeys.delete(id);
      }
      if (body.teamCounts) Object.assign(saved.current.teamCounts, body.teamCounts);
      if (body.schedules)                        saved.current.schedulesKey  = schedulesKey(body.schedules);
      if (body.exhibitionSchedule)               saved.current.exhibitionKey = exhibitionKey(body.exhibitionSchedule);
      if (body.finalsSchedule)                   saved.current.finalsKey     = finalsKey(body.finalsSchedule);

      pendingFull.current = null;
      retries.current = 0;
      setSaveError(null);
      inFlight.current = false;
      // Edits that arrived mid-flight are still dirty — go round again. The
      // badge derives 'pending' from that same diff, so it stays truthful.
      setSaveStatus('saved');
      if (hasUnsavedWork(latest.current)) scheduleSave(200);
    } catch (err) {
      inFlight.current = false;
      retries.current += 1;
      setSaveError(err instanceof Error ? err.message : 'Unknown error');
      setSaveStatus('error');
      console.error('[admin] bracket save failed:', err);
      // Keep trying — a venue Wi-Fi blip shouldn't silently lose a result.
      scheduleSave(Math.min(30_000, 1_000 * 2 ** Math.min(retries.current, 5)));
    }
  }

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (hasUnsavedWork(latest.current)) scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, teamCounts, schedules, exhibitionSchedule, finalsSchedule]);

  // Last line of defence for Fix 4: don't let a closing tab take an unsaved
  // result with it.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedWork(latest.current)) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── realtime: pick up other admins' changes ──────────────────────────────────
  // bracket_matches / bracket_config / bracket_schedule are already in the
  // supabase_realtime publication (migration 0006), so this needs no schema
  // change. useRealtimeRefresh can't be reused here: it calls router.refresh(),
  // which updates the server props but never re-seeds useState.
  //
  // On any remote write we re-read the authoritative state and merge it in,
  // keeping our own dirty rows — so an edit in progress is never yanked out from
  // under whoever is typing it.
  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) return;   // no anon key configured → single-admin mode, no sync

    let timer: ReturnType<typeof setTimeout> | undefined;

    const pull = async () => {
      timer = undefined;
      // Our own save is mid-flight: its echo is about to arrive anyway, and
      // pulling now would race the baseline update. Try again shortly.
      if (inFlight.current) { schedule(1_000); return; }
      try {
        const res = await fetch('/api/admin/bracket');
        if (!res.ok) return;
        mergeRemote(await res.json() as InitialBracket);
      } catch (err) {
        console.error('[admin] realtime pull failed:', err);
      }
    };

    // Coalesce a burst of row writes (one save touches many rows) into one pull.
    const schedule = (delay = REALTIME_SETTLE_MS) => {
      if (timer) return;
      timer = setTimeout(() => void pull(), delay);
    };

    let channel = sb.channel('admin:bracket');
    for (const table of ['bracket_matches', 'bracket_config', 'bracket_schedule']) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => schedule());
    }
    channel.subscribe();
    return () => { if (timer) clearTimeout(timer); sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Folds the server's state into ours: remote wins for everything we haven't
   * touched, local wins for anything still unsaved. The baseline moves with the
   * remote values it adopts, so adopting them doesn't look like a fresh local
   * edit and can't bounce back as a save.
   */
  function mergeRemote(remote: InitialBracket) {
    // A whole-bracket replace is queued (auto-fill / resize / reset): our local
    // set IS the intended end state, including the rows it drops. Adopting
    // anything from the server here would partly undo it — a resize would have
    // its deleted rounds handed straight back and then re-saved.
    if (pendingFull.current !== null) return;

    const dirty = dirtyMatchIds(latest.current);

    setMatches(prev => {
      const prevById = new Map(prev.map(m => [m.id, m]));
      const merged = remote.matches.map(rm => (dirty.has(rm.id) ? prevById.get(rm.id) ?? rm : rm));
      // Rows we've created but not yet saved (a new exhibition match) aren't in
      // the remote set — keep them rather than making them vanish mid-edit.
      const remoteIds = new Set(remote.matches.map(m => m.id));
      for (const id of dirty) {
        const local = prevById.get(id);
        if (local && !remoteIds.has(id)) merged.push(local);
      }
      return merged;
    });

    for (const rm of remote.matches) {
      if (!dirty.has(rm.id)) saved.current.matchKeys.set(rm.id, matchKey(rm));
    }
    const remoteIds = new Set(remote.matches.map(m => m.id));
    for (const id of [...saved.current.matchKeys.keys()]) {
      if (!remoteIds.has(id) && !dirty.has(id)) saved.current.matchKeys.delete(id);
    }

    // A resize or a ring change we haven't saved yet must not be reverted by a
    // remote pull; otherwise adopt.
    if (pendingFull.current === null) {
      // Per division, so adopting Open's new size doesn't clobber an unsaved
      // local resize of Standards.
      for (const d of ALL_DIVISIONS) {
        if (latest.current.teamCounts[d] === saved.current.teamCounts[d]
            && remote.teamCounts[d] !== saved.current.teamCounts[d]) {
          saved.current.teamCounts[d] = remote.teamCounts[d];
          setTeamCounts(prev => ({ ...prev, [d]: remote.teamCounts[d] }));
        }
      }
      if (schedulesKey(latest.current.schedules) === saved.current.schedulesKey) {
        saved.current.schedulesKey = schedulesKey(remote.schedules);
        setSchedules(remote.schedules);
      }
      if (exhibitionKey(latest.current.exhibitionSchedule) === saved.current.exhibitionKey) {
        saved.current.exhibitionKey = exhibitionKey(remote.exhibitionSchedule);
        setExhibitionSchedule(remote.exhibitionSchedule);
      }
      if (finalsKey(latest.current.finalsSchedule) === saved.current.finalsKey) {
        saved.current.finalsKey = finalsKey(remote.finalsSchedule);
        setFinalsSchedule(remote.finalsSchedule);
      }
    }
  }

  /**
   * Marks the next save as a whole-bracket replace (auto-fill / resize / reset).
   * Schedules it directly as well, so the flag can never be left sitting on the
   * ref to turn some later unrelated edit into a destructive replaceAll.
   */
  function requestFullSave(clearCaptainNotified?: Division[]) {
    pendingFull.current = { clearCaptainNotified };
    scheduleSave();
  }

  // ── teams ────────────────────────────────────────────────────────────────────
  // Same baseline-diff idea as the bracket, at FIELD granularity (which is how
  // the PATCH endpoint saves): savedTeams holds what the server last told us, so
  // a pulled team list can adopt every field except the ones with an unsaved
  // local edit.
  const latestTeams = useRef(teams);
  latestTeams.current = teams;
  const savedTeams = useRef(new Map(initialTeams.map(t => [t.id, t] as const)));

  function teamDirtyFields(t: Team): TeamField[] {
    const base = savedTeams.current.get(t.id);
    if (!base) return [...TEAM_FIELDS];          // server hasn't seen this team yet
    return TEAM_FIELDS.filter(f => t[f] !== base[f]);
  }

  /** Puts the given fields back to the last value the server confirmed. */
  function revertTeamFields(id: string, fields: TeamField[]) {
    const base = savedTeams.current.get(id);
    if (!base) return;
    const restored = Object.fromEntries(fields.map(f => [f, base[f]])) as Partial<Team>;
    setTeams(prev => prev.map(t => t.id === id ? { ...t, ...restored } : t));
  }

  const teamSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function handleTeamUpdate(id: string, patch: Partial<Team>) {
    setTeams(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));

    const fields = Object.keys(patch) as TeamField[];
    const key = `${id}-${[...fields].sort().join(',')}`;
    clearTimeout(teamSaveTimers.current[key]);
    teamSaveTimers.current[key] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/teams/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });

        // The server rejected a seed that's already taken in this division —
        // possibly by a team another admin seeded after our list was loaded.
        if (res.status === 409) {
          const { conflicts } = await res.json().catch(() => ({ conflicts: [] }));
          revertTeamFields(id, fields);
          setErrorDialog({
            title: 'Seed already taken',
            message: `${describeSeedConflicts((conflicts ?? []) as SeedConflict[], DIVISION_LABEL)}. Each team in a division needs its own seed, so the change was reverted.`,
          });
          return;
        }
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);

        // Baseline advances only for the fields this request carried.
        const base = savedTeams.current.get(id);
        if (base) savedTeams.current.set(id, { ...base, ...patch });
      } catch (err) {
        // Revert rather than leave an unsaved value sitting on screen looking
        // saved — the same trap the bracket's save badge exists to close.
        console.error('[admin] team update failed:', err);
        revertTeamFields(id, fields);
        setErrorDialog({
          title: 'Change not saved',
          message: `${err instanceof Error ? err.message : 'Unknown error'}. The change was reverted — please try again.`,
        });
      }
    }, 300);
  }

  /**
   * Folds a freshly-read team list in: remote wins for every field, except ones
   * with an unsaved local edit. Dirty sets are computed BEFORE the baseline moves
   * — otherwise every field would look clean against the new baseline and local
   * edits would be silently dropped.
   */
  function mergeRemoteTeams(remote: Team[]) {
    const dirtyByTeam = new Map<string, TeamField[]>();
    for (const t of latestTeams.current) {
      const d = teamDirtyFields(t);
      if (d.length > 0) dirtyByTeam.set(t.id, d);
    }
    const localById = new Map(latestTeams.current.map(t => [t.id, t]));

    setTeams(remote.map(rt => {
      const dirty = dirtyByTeam.get(rt.id);
      const local = localById.get(rt.id);
      if (!dirty || !local) return rt;
      return { ...rt, ...(Object.fromEntries(dirty.map(f => [f, local[f]])) as Partial<Team>) };
    }));

    // The baseline is always the server's value — a field we kept locally stays
    // dirty against it, so its in-flight PATCH still counts as pending.
    savedTeams.current = new Map(remote.map(t => [t.id, t] as const));
  }

  async function pullTeams(): Promise<void> {
    try {
      const res = await fetch('/api/admin/teams');
      if (!res.ok) return;
      mergeRemoteTeams(await res.json() as Team[]);
    } catch (err) {
      console.error('[admin] team pull failed:', err);
    }
  }

  // ── special (one-time/exhibition) teams ──────────────────────────────────────
  // Same baseline-diff model as regular teams. Special teams can also be created
  // and deleted here, so the merge has to cope with rows appearing and going away
  // — including not resurrecting one whose DELETE is still in flight.
  const latestSpecialTeams = useRef(specialTeams);
  latestSpecialTeams.current = specialTeams;
  const savedSpecialTeams = useRef(new Map(initialSpecialTeams.map(t => [t.id, t] as const)));
  const pendingSpecialDeletes = useRef<Set<string>>(new Set());

  function specialTeamDirtyFields(t: SpecialTeam): SpecialTeamField[] {
    const base = savedSpecialTeams.current.get(t.id);
    if (!base) return [...SPECIAL_TEAM_FIELDS];
    return SPECIAL_TEAM_FIELDS.filter(f => t[f] !== base[f]);
  }

  function revertSpecialTeamFields(id: string, fields: SpecialTeamField[]) {
    const base = savedSpecialTeams.current.get(id);
    if (!base) return;
    const restored = Object.fromEntries(fields.map(f => [f, base[f]])) as SpecialTeamPatch;
    setSpecialTeams(prev => prev.map(t => t.id === id ? { ...t, ...restored } : t));
  }

  async function handleAddSpecialTeam(input: SpecialTeamInput) {
    try {
      const res = await fetch('/api/admin/special-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Add failed');
      const created: SpecialTeam = await res.json();
      savedSpecialTeams.current.set(created.id, created);
      setSpecialTeams(prev => prev.some(t => t.id === created.id) ? prev : [created, ...prev]);
    } catch (err) {
      console.error('[admin] add special team failed:', err);
      setErrorDialog({
        title: 'Team not added',
        message: `${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
      });
    }
  }

  const specialTeamSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function handleUpdateSpecialTeam(id: string, patch: SpecialTeamPatch) {
    setSpecialTeams(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));

    const fields = Object.keys(patch) as SpecialTeamField[];
    const key = `${id}-${[...fields].sort().join(',')}`;
    clearTimeout(specialTeamSaveTimers.current[key]);
    specialTeamSaveTimers.current[key] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/special-teams/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        const base = savedSpecialTeams.current.get(id);
        if (base) savedSpecialTeams.current.set(id, { ...base, ...patch });
      } catch (err) {
        // Revert, as for regular teams: a value left on screen that never
        // reached the database would also be preserved forever by the merge
        // below (it stays "dirty" with nothing pending to save it).
        console.error('[admin] special team update failed:', err);
        revertSpecialTeamFields(id, fields);
        setErrorDialog({
          title: 'Change not saved',
          message: `${err instanceof Error ? err.message : 'Unknown error'}. The change was reverted — please try again.`,
        });
      }
    }, 300);
  }

  async function handleDeleteSpecialTeam(id: string) {
    const prev = specialTeams;
    // Flagged so a merge landing mid-DELETE doesn't hand the row straight back.
    pendingSpecialDeletes.current.add(id);
    setSpecialTeams(cur => cur.filter(t => t.id !== id));
    try {
      const res = await fetch(`/api/admin/special-teams/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      savedSpecialTeams.current.delete(id);
    } catch (err) {
      console.error('[admin] delete special team failed:', err);
      setSpecialTeams(prev); // revert on failure
      setErrorDialog({
        title: 'Team not deleted',
        message: `${err instanceof Error ? err.message : 'Unknown error'}. The team is still there — please try again.`,
      });
    } finally {
      pendingSpecialDeletes.current.delete(id);
    }
  }

  /** Special-teams counterpart to mergeRemoteTeams — same before-the-baseline-moves rule. */
  function mergeRemoteSpecialTeams(remote: SpecialTeam[]) {
    const dirtyByTeam = new Map<string, SpecialTeamField[]>();
    for (const t of latestSpecialTeams.current) {
      const d = specialTeamDirtyFields(t);
      if (d.length > 0) dirtyByTeam.set(t.id, d);
    }
    const localById = new Map(latestSpecialTeams.current.map(t => [t.id, t]));

    setSpecialTeams(
      remote
        .filter(rt => !pendingSpecialDeletes.current.has(rt.id))
        .map(rt => {
          const dirty = dirtyByTeam.get(rt.id);
          const local = localById.get(rt.id);
          if (!dirty || !local) return rt;
          return { ...rt, ...(Object.fromEntries(dirty.map(f => [f, local[f]])) as SpecialTeamPatch) };
        }),
    );

    savedSpecialTeams.current = new Map(remote.map(t => [t.id, t] as const));
  }

  async function pullSpecialTeams(): Promise<void> {
    try {
      const res = await fetch('/api/admin/special-teams');
      if (!res.ok) return;
      mergeRemoteSpecialTeams(await res.json() as SpecialTeam[]);
    } catch (err) {
      console.error('[admin] special team pull failed:', err);
    }
  }

  // ── live team sync ───────────────────────────────────────────────────────────
  // Neither teams nor special teams can be subscribed to directly: Realtime
  // enforces RLS for the anon key, and a public-read policy on
  // pickabots_team_state / special_teams would publish private admin notes and
  // special teams' contact details to anyone with that key (it ships in the
  // client bundle). So a trigger bumps admin_data_signal — a one-row table
  // holding only a timestamp — and the bump makes us refetch through the
  // admin-gated endpoints. See 0023_admin_data_signal.sql.
  async function pullAdminTeamData(): Promise<void> {
    await Promise.all([pullTeams(), pullSpecialTeams()]);
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Coalesce: one admin action can touch teams and team_state in quick
    // succession, and every open page hears about all of it.
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; void pullAdminTeamData(); }, ADMIN_DATA_SETTLE_MS);
    };

    // Cheap catch-all: someone coming back to the tab gets current data even if
    // an event was missed while the socket was asleep.
    const onVisible = () => { if (document.visibilityState === 'visible') void pullAdminTeamData(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    // The slow poll runs even WITH a working subscription, deliberately. This
    // repo's migrations are pasted into the Supabase dashboard by hand, so the
    // code ships before the SQL runs — and a subscription to a table that isn't
    // in the publication yet simply never fires rather than reporting an error.
    // One small request a minute keeps the page correct in the meantime (and if
    // the socket ever drops), while the signal is what makes it feel instant.
    const poll = setInterval(() => void pullAdminTeamData(), ADMIN_DATA_FALLBACK_POLL_MS);

    // No pull on mount — the initial props came from the server microseconds ago.
    const sb = getBrowserSupabase();
    const channel = sb
      ?.channel('admin:team-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_data_signal' }, schedule);
    channel?.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      if (sb && channel) sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eliminatedTeams = useMemo(() => computeEliminated(matches), [matches]);

  // Lead-time captain SMS alerts fire server-side in saveBracketState (see
  // lib/db/bracket.ts) on every bracket save, so they work regardless of who's
  // viewing /admin and honour the configurable notify-lead.

  // Schedule-derived active/next/todo status — computed for BOTH divisions
  // (mirrors saveBracketState's server-side reconciliation), not just the
  // currently-selected one. Completed and skipped are preserved; the
  // schedule order determines everything else. Exhibition matches are exempt
  // (see applyScheduleStatus) — their status is entirely admin-controlled
  // via the dropdown, so `matches` already reflects it with no derivation.
  // Finals matches are exempt from the per-division passes (they sit on the one
  // shared Finals Day ring, not in either division's rings), so their
  // active/next is derived from that ring instead — same rule, one ring.
  const effectiveMatches = useMemo(
    () => applyFinalsScheduleStatus(
      (['standards', 'open'] as Division[]).reduce(
        (acc, d) => applyScheduleStatus(acc, schedules[d], d), matches,
      ),
      finalsSchedule,
    ),
    [matches, schedules, finalsSchedule],
  );

  // ── bracket size change ──────────────────────────────────────────────────────
  // Sizes are per division: bracket_config has a row each, and a save now sends
  // only the division being resized (see saveBracketState), so Standards and
  // Open can run different-sized brackets. A resize rebuilds ONLY the division
  // it was asked for; the other one is left exactly as it is.
  function hasBracketData(div: Division): boolean {
    return matches.some(m =>
      m.division === div && (m.slotA.teamName !== '' || m.slotB.teamName !== '')
    );
  }

  function requestSizeChange(n: TeamCount) {
    if (n === teamCounts[division]) return;
    // Only this division's data is at risk now, so that's all we warn about.
    if (hasBracketData(division)) {
      setPending({ division, n });
    } else {
      applySizeChange(division, n);
    }
  }

  function applySizeChange(div: Division, n: TeamCount) {
    // Transfer just this division; every other match row (the other division's
    // whole bracket, and exhibition matches, which have no seat in a generated
    // bracket and so can't be carried by transferBracket) passes through
    // untouched.
    const newMatches = [
      ...transferBracket(matches, div, teamCounts[div], n),
      ...matches.filter(m => m.division !== div || m.side === 'exhibition'),
    ];
    // Whole-bracket rebuild: rows for rounds that no longer exist have to be
    // deleted, which only a replaceAll save does.
    requestFullSave();
    setMatches(newMatches);
    // Rebuild ONLY the resized division's schedule, as a rolling schedule (just
    // the currently-playable matches), preserving its ring count, timing params
    // and Round 1 layout — transferBracket carries the teams over, so the round
    // keeps the shape the last Auto Fill gave it and must keep its play order
    // too. Only an Auto Fill changes the layout. The other division's matches
    // didn't move, so its schedule (including any hand-edited ring order and
    // times) is left alone.
    setSchedules(prev => ({
      ...prev,
      [div]: rollSchedule(
        generateSchedule(
          [],
          prev[div].concurrentRings,
          prev[div].rings[0]?.[0]?.startMinute ?? START_MINUTE,
          prev[div].matchMinutes,
          prev[div].gapMinutes,
          prev[div].autoFillMode,
        ),
        newMatches,
        div,
      ),
    }));
    setTeamCounts(prev => ({ ...prev, [div]: n }));
    setPending(null);
  }

  // Any change to matches re-rolls the current division's schedule: newly-ready
  // matches (teams just decided by a completed feeder) get appended, anything
  // no longer playable is dropped — keeping the match list a rolling list of
  // only-playable matches.
  function commitMatches(next: BracketMatch[]) {
    setMatches(next);
    setSchedules(prev => ({ ...prev, [division]: rollSchedule(prev[division], next, division) }));
  }

  // ── auto-fill: reset the division's bracket and seed Round 1 ─────────────────
  // Rebuilds the CURRENT division's bracket from scratch, then seeds its WB
  // Round 1 from the in-bracket teams (by seed, unseeded shuffled into whatever
  // slots are left). Lifted out of AdminBracket so the bracket's Auto Fill
  // button and the Settings panel's post-import prompt share one implementation.
  // `mode` picks the Round 1 layout — see AutoFillMode in lib/seeds.
  function handleAutoFill(mode: AutoFillMode) {
    const div = division;
    // In-bracket = explicit override, else auto (has a seed) — same rule as the
    // Teams list toggle. A seeded team turned off keeps its seed but is skipped.
    const divTeams = teams.filter(t => t.division === div && (t.inBracket ?? (t.seed != null)));

    // Regenerate rather than overwrite the loaded matches in place: Auto Fill
    // resets the WHOLE division, so every round's teams, scores and statuses go
    // back to empty/'todo'. Overwriting only R1's slots left the rest of the
    // tree holding stale teams and results, and left a previously-'completed' R1
    // match completed with its NEW teams and 0-0 scores — which both
    // rollSchedule and applyScheduleStatus preserve, making that match
    // permanently unplayable. Regenerating also means the bracket shape follows
    // the generator (same reasoning as handleResetAll). Wildcard boxes are
    // cleared along with everything else.
    const fresh = generateDoubleElimBracket(teamCounts[div], div);

    const r1 = fresh
      .filter(m => m.side === 'winners' && m.round === 1)
      .sort((a, b) => a.matchNumber - b.matchNumber);
    const numMatches = r1.length;
    const T = 2 * numMatches;   // bracket team slots

    // More in-bracket teams than slots has no correct answer — the extras used
    // to be dropped silently, which read as a successful fill. Refuse instead,
    // so the admin either grows the bracket or turns teams off.
    if (divTeams.length > T) {
      const bigger = TEAM_COUNTS.find(c => c >= divTeams.length);
      setErrorDialog({
        title: 'Too many teams for this bracket',
        message:
          `${DIVISION_LABEL[div]} has ${divTeams.length} in-bracket teams but the bracket only has ${T} slots. ` +
          (bigger ? `Set the bracket to ${bigger} teams, or turn ` : `Turn `) +
          `${divTeams.length - T} team${divTeams.length - T === 1 ? '' : 's'} off in the Teams list, then try again.`,
      });
      return;
    }

    // Two teams on the same seed have no defined order between them, so the
    // bracket they'd produce is arbitrary. Refuse and name the clashes.
    const dupes = computeSeedConflicts(divTeams);
    if (dupes.length > 0) {
      setErrorDialog({
        title: 'Duplicate seeds',
        message:
          `${DIVISION_LABEL[div]} has ${dupes.length > 1 ? 'seeds' : 'a seed'} used more than once — ` +
          describeSeedConflicts(dupes, DIVISION_LABEL) +
          `. Give each in-bracket team its own seed, then try again.`,
      });
      return;
    }

    // Seed 1 is the TOP seed, so sort ascending: sorted[0] is the strongest team
    // and its index is the team's RANK, not its seed number — only the relative
    // order matters, so gaps in the seed numbering change nothing. Unseeded
    // in-bracket teams are shuffled in behind every seeded team, which in either
    // mode puts them among the weakest ranks.
    const withSeed = [...divTeams.filter(t => t.seed !== null)].sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
    const noSeed   = [...divTeams.filter(t => t.seed === null)];
    for (let i = noSeed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [noSeed[i], noSeed[j]] = [noSeed[j], noSeed[i]];
    }
    const sorted = [...withSeed, ...noSeed];   // sorted[0] = seed 1 (strongest)

    // Both layouts come from one place, keyed by match number, so this only has
    // to copy names into slots.
    const pairs = round1Pairs(mode, sorted.map(t => t.name), numMatches);

    const seeded = fresh.map(m => {
      if (m.side !== 'winners' || m.round !== 1) return m;
      const pair = pairs[m.matchNumber - 1] ?? { a: '', b: '' };
      return {
        ...m,
        slotA: { teamName: pair.a, score: 0 },
        slotB: { teamName: pair.b, score: 0 },
      };
    });

    // Any R1 match left with a single team (fewer in-bracket teams than slots)
    // is a bye: auto-complete it and advance that team to R2 so it never shows
    // up as a playable match. rollSchedule then excludes it from the list. In
    // both modes round1Pairs leaves the empty slots where the byes land on the
    // strongest seeds — see there for how each layout arranges that.
    const resolved = completeRound1Byes(seeded, div);

    // Exhibition matches carry a real `division` but sit outside the bracket
    // tree (own rings, admin-controlled status) and the generator emits none —
    // keep them, or the bracket save would delete them as stale rows.
    const nextMatches = [
      ...matches.filter(m => m.division !== div || m.side === 'exhibition'),
      ...resolved,
    ];

    // Whole-bracket replace, and clear this division's captain-notified flags:
    // they're per-match and dedupe the "up next" SMS, so leaving them set would
    // mean the teams just placed into an already-notified match never get texted.
    requestFullSave([div]);
    setMatches(nextMatches);
    setSchedules(prev => ({
      ...prev,
      // The chosen layout is recorded ON the schedule, not baked into a
      // one-off match order: defaultScheduleOrder reads it back, so the play
      // order survives a ring change (which re-spreads every match from
      // scratch), a reload, and the server's own rolls.
      //
      // Caveat, only when there are byes: this mode pairs the bye seeds off in
      // R2, so those R2 matches have both teams from the start. rollSchedule
      // gives every ready match an earlier slot than one still waiting on a
      // winner, so they play ahead of the R2 matches fed by R1 — R2 runs e.g.
      // M3, M4, M1, M2 rather than M1..M4. Round 1 is unaffected, the ready
      // matches keep top-to-bottom order among themselves, and seed 1 v seed 2
      // is still the last of them; a full bracket has no byes and so runs
      // top-to-bottom throughout.
      [div]: rollSchedule(
        generateSchedule(
          [],
          prev[div].concurrentRings,
          prev[div].rings[0]?.[0]?.startMinute ?? START_MINUTE,
          prev[div].matchMinutes,
          prev[div].gapMinutes,
          mode,
        ),
        nextMatches,
        div,
      ),
    }));
  }

  // ── bulk team actions (Settings panel) — current division only ───────────────
  async function bulkPostTeams(body: Record<string, unknown>) {
    const res = await fetch('/api/admin/teams/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Bulk update failed');
  }

  /** Applies one field to every team in the current division, baseline included. */
  function markBulkSaved(ids: string[], patch: Partial<Team>) {
    for (const id of ids) {
      const base = savedTeams.current.get(id);
      if (base) savedTeams.current.set(id, { ...base, ...patch });
    }
  }

  async function handleSetAllPresent(present: boolean) {
    const ids = teams.filter(t => t.division === division).map(t => t.id);
    setTeams(prev => prev.map(t => t.division === division ? { ...t, present } : t));
    await bulkPostTeams({ ids, present });
    markBulkSaved(ids, { present });
  }

  async function handleSetAllInBracket(inBracket: boolean) {
    const ids = teams.filter(t => t.division === division).map(t => t.id);
    setTeams(prev => prev.map(t => t.division === division ? { ...t, inBracket } : t));
    await bulkPostTeams({ ids, inBracket });
    markBulkSaved(ids, { inBracket });
  }

  // Matches each CSV row to an existing team by name+division (teams come from
  // the shared registration table, so import can only update seeds, never
  // create teams). Returns how many matched and which rows didn't — the
  // caller surfaces the skipped list.
  async function handleImportSeeds(rows: SeedImportRow[]): Promise<SeedImportResult> {
    const norm = (s: string) => s.trim().toLowerCase();
    const matched: { id: string; seed: number }[] = [];
    const unmatched: SeedImportRow[] = [];
    for (const row of rows) {
      const team = teams.find(t => t.division === row.division && norm(t.name) === norm(row.name));
      if (team) matched.push({ id: team.id, seed: row.seed });
      else unmatched.push(row);
    }

    // Reject rather than half-apply: check the seeds each division would END UP
    // with (imported values layered over the seeds already there), so a clash
    // against a team that isn't even in the file is caught too. Nothing is
    // written if any division has a duplicate.
    const seedById = new Map(matched.map(m => [m.id, m.seed]));
    const conflicts = computeSeedConflicts(
      teams.map(t => ({ ...t, seed: seedById.get(t.id) ?? t.seed })),
    );
    if (conflicts.length > 0) {
      return { imported: 0, unmatched, duplicates: toDuplicates(conflicts) };
    }

    if (matched.length > 0) {
      // Write BEFORE touching local state: the server runs the same check
      // against the real current seeds (our team list may be minutes stale, and
      // another admin may have taken one of these seeds since), so it can still
      // reject. Applying afterwards means there's nothing to roll back.
      const res = await fetch('/api/admin/teams/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seeds: matched }),
      });
      if (res.status === 409) {
        const { conflicts } = await res.json().catch(() => ({ conflicts: [] }));
        void pullTeams();   // our snapshot was out of date — get the real seeds
        return {
          imported: 0,
          unmatched,
          duplicates: ((conflicts ?? []) as SeedConflict[]).map(c => ({
            division: c.division,
            seed: c.seed,
            names: c.teams.map(t => t.name),
          })),
        };
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Seed import failed');

      setTeams(prev => prev.map(t => seedById.has(t.id) ? { ...t, seed: seedById.get(t.id)! } : t));
      for (const [id, seed] of seedById) {
        const base = savedTeams.current.get(id);
        if (base) savedTeams.current.set(id, { ...base, seed });
      }
    }
    return { imported: matched.length, unmatched };
  }

  // ── full competition reset ("Reset All") ──────────────────────────────────────
  // Clears every match's teams/scores/status across BOTH divisions and drops
  // exhibition matches entirely — same transform the old per-division "Clear
  // Teams" used, just applied everywhere. Persisted via the normal debounced
  // bracket-save effect above (matches submitted without exhibition rows are
  // deleted server-side — see saveBracketState's stale-row cleanup), which
  // also refunds/deletes any votes tied to matches it invalidates. Separately,
  // wipes ALL voting history and resets every balance to 100 — the bracket
  // save alone doesn't reach votes on already-resolved matches. Leaves
  // teams/special_teams rows themselves untouched (special teams especially —
  // only their bracket placement, which they never had, would be affected).
  async function handleResetAll() {
    // Regenerate both divisions from scratch rather than blanking the matches
    // already loaded. Clearing in place froze the bracket's SHAPE at whatever
    // was in the table, so a change to the generator (the wildcard boxes, say)
    // could never be picked up by a reset — the only way out was deleting the
    // rows by hand. saveBracketState's stale-row cleanup deletes whatever the
    // new set no longer contains, so the shape genuinely follows the generator.
    // Exhibition matches are dropped, same as before: the generator emits none.
    const regenerated = ALL_DIVISIONS.flatMap(d => generateDoubleElimBracket(teamCounts[d], d));

    // Whole-bracket replace (exhibition rows are deleted by the stale-row sweep),
    // clearing both divisions' captain-notified flags so the next teams to
    // occupy each match are texted again.
    requestFullSave(ALL_DIVISIONS);

    const rebuildSchedule = (d: Division, s: MatchSchedule): MatchSchedule => {
      const safeRings = Math.min(MAX_RINGS, Math.max(1, s.concurrentRings)) as ConcurrentRings;
      return rollSchedule(
        generateSchedule([], safeRings, s.rings[0]?.[0]?.startMinute ?? START_MINUTE, s.matchMinutes, s.gapMinutes, s.autoFillMode),
        regenerated,
        d,
      );
    };

    setMatches(regenerated);
    setSchedules({ standards: rebuildSchedule('standards', schedules.standards), open: rebuildSchedule('open', schedules.open) });
    // regenerated has no exhibition matches (the generator emits none), so this
    // empties every exhibition ring's contents while keeping the ring
    // columns themselves — same as the per-division behavior this replaced.
    setExhibitionSchedule(prev => rollExhibitionSchedule(prev, regenerated));
    // The regenerated bracket has fresh (empty) finals matches, so the ring keeps
    // its eight slots and its times while every result in it is cleared.
    setFinalsSchedule(prev => rollFinalsSchedule(prev, regenerated));

    try {
      const res = await fetch('/api/admin/reset-all', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Reset failed');
    } catch (err) {
      console.error('[admin] reset-all failed:', err);
    }
  }

  // ── panel content for the draggable/resizable grid ──────────────────────────
  // Every panel's node is built here; PanelGrid mounts only the ones currently
  // on the grid (see AdminPanelContext.visiblePanels), so the unused ones never
  // render. Each panel keeps its own container-query layout — the grid only
  // resizes the tile's box, so font sizes stay constant.
  const panelMap: Record<PanelId, { title: string; node: React.ReactNode }> = {
    teams: {
      title: 'Teams',
      node: (
        <TeamList
          teams={teams}
          division={division}
          eliminatedTeams={eliminatedTeams}
          onTeamUpdate={handleTeamUpdate}
          specialTeams={specialTeams}
          onAddSpecialTeam={handleAddSpecialTeam}
          onUpdateSpecialTeam={handleUpdateSpecialTeam}
          onDeleteSpecialTeam={handleDeleteSpecialTeam}
        />
      ),
    },
    bracket: {
      title: 'Bracket',
      node: (
        <div className="flex h-full flex-col">
          {/* Bracket size ("Number of Teams") and Reset All now live in the
              Settings panel; the bracket keeps only its own Auto Fill button. */}
          <div className="min-h-0 flex-1">
            <AdminBracket
              teams={teams}
              matches={effectiveMatches}
              division={division}
              teamCount={teamCounts[division]}
              schedule={schedules[division]}
              onMatchesChange={commitMatches}
              onScheduleChange={s => setSchedules(prev => ({ ...prev, [division]: s }))}
              onAutoFill={handleAutoFill}
            />
          </div>
        </div>
      ),
    },
    matches: {
      title: 'Matches',
      node: (
        <MatchesPanel
          matches={effectiveMatches}
          division={division}
          teamCount={teamCounts[division]}
          teamCounts={teamCounts}
          schedule={schedules[division]}
          exhibitionSchedule={exhibitionSchedule}
          finalsSchedule={finalsSchedule}
          teams={teams}
          specialTeams={specialTeams}
          onScheduleChange={s =>
            setSchedules(prev => ({ ...prev, [division]: s }))
          }
          onExhibitionScheduleChange={setExhibitionSchedule}
          onFinalsScheduleChange={setFinalsSchedule}
          onMatchesChange={commitMatches}
        />
      ),
    },
    players:  { title: 'Players',  node: <PlayersPanel /> },
    settings: {
      title: 'Settings',
      node: (
        <SettingsPanel
          division={division}
          teamCount={teamCounts[division]}
          teamCountOptions={TEAM_COUNTS}
          onTeamCountChange={requestSizeChange}
          onSetAllPresent={handleSetAllPresent}
          onSetAllInBracket={handleSetAllInBracket}
          onImportSeeds={handleImportSeeds}
          onAutoFill={handleAutoFill}
          onResetAll={handleResetAll}
        />
      ),
    },
  };

  return (
    <>
      {/* Draggable / resizable panel grid */}
      <div className="h-full w-full">
        <PanelGrid panels={panelMap} />
      </div>

      {/* Confirm bracket size change */}
      {pendingCount !== null && (
        <ConfirmDialog
          title={`Change ${DIVISION_LABEL[pendingCount.division]} bracket to ${pendingCount.n} teams?`}
          message={`Only the ${DIVISION_LABEL[pendingCount.division]} bracket is resized — the other division keeps its own size. Later rounds (finals, semis, quarters) are kept and earlier rounds that no longer exist are discarded. Exhibition matches are unaffected.`}
          confirmLabel="Change size"
          onConfirm={() => applySizeChange(pendingCount.division, pendingCount.n)}
          onCancel={() => setPending(null)}
        />
      )}

      {/* Auto Fill refused, or a team change the server wouldn't accept */}
      {errorDialog !== null && (
        <AlertDialog
          title={errorDialog.title}
          message={errorDialog.message}
          onDismiss={() => setErrorDialog(null)}
        />
      )}

      {/* Save state — a failed save used to be console-only, so an admin could
          enter a result that never reached the database and never know.
          "Unsaved" is derived at render time from the same diff the saver uses,
          so it can't drift out of step with what's actually pending. */}
      <SaveBadge
        status={
          saveStatus === 'saved' && hasUnsavedWork({ matches, teamCounts, schedules, exhibitionSchedule, finalsSchedule })
            ? 'pending'
            : saveStatus
        }
        error={saveError}
        onRetry={() => { retries.current = 0; void flushSave(); }}
      />
    </>
  );
}

// ── save-status badge ────────────────────────────────────────────────────────
function SaveBadge({
  status, error, onRetry,
}: { status: SaveStatus; error: string | null; onRetry: () => void }) {
  const LOOK: Record<SaveStatus, { dot: string; text: string; label: string }> = {
    saved:   { dot: 'bg-emerald-400',        text: 'text-foreground/40', label: 'Saved' },
    pending: { dot: 'bg-amber-300',          text: 'text-foreground/60', label: 'Unsaved changes' },
    saving:  { dot: 'bg-amber-300 animate-pulse', text: 'text-foreground/60', label: 'Saving…' },
    error:   { dot: 'bg-red-400 animate-pulse',   text: 'text-red-300',  label: 'Save failed' },
  };
  const look = LOOK[status];

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-3 right-3 z-40 flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.65rem] backdrop-blur-sm transition-colors",
        status === 'error'
          ? "pointer-events-auto border-red-400/40 bg-red-950/70"
          : "border-white/10 bg-black/50",
      )}
      title={status === 'error' && error ? error : undefined}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", look.dot)} />
      <span className={look.text}>{look.label}</span>
      {status === 'error' && (
        <>
          <span className="text-red-300/50">· retrying</span>
          <button
            onClick={onRetry}
            className="pointer-events-auto rounded-full border border-red-400/40 px-2 py-0.5 text-red-200 transition-colors hover:bg-red-400/20"
          >
            Retry now
          </button>
        </>
      )}
    </div>
  );
}
