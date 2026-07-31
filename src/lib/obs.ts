// Shared (client-safe) types + constants for the OBS streaming companion.
// The server-only DB access lives in src/lib/db/obs.ts; the relay agent that
// actually talks to OBS lives outside the app in relay/ (see docs/OBS.md).

/** obs-websocket requests the relay knows how to execute. Must stay in sync
 *  with the CHECK constraint in migration 0022. */
export type ObsAction =
  | "set_scene"
  | "start_stream" | "stop_stream"
  | "start_record" | "stop_record"
  | "start_replay_buffer" | "save_replay_buffer";

/**
 * The OBS scene-name convention the control panel targets: one scene per
 * physical ring, named exactly "Ring 1" … "Ring 6". The scenes are created by
 * hand in OBS (docs/OBS.md) — this just has to match what was typed there.
 */
export function ringSceneName(ring: number): string {
  return `Ring ${ring}`;
}

/**
 * Non-ring "screen" scenes the panel also offers — full-frame info boards to
 * cut to between matches, each an OBS scene holding one overlay browser
 * source (see docs/OBS.md §4). Same deal as ring scenes: names must match
 * what's typed in OBS exactly. Scenes that don't exist in OBS simply fail
 * the switch (logged by the relay), so a setup using only some is fine.
 *
 * "Standby" is the emergency holding screen — built from a LOCAL image/text
 * in OBS, never a browser source, so it stays presentable even if the venue
 * internet (and with it every overlay) is down. Cut to it whenever anything
 * breaks on camera.
 */
// "Commentary" is the phone-camera scene (Larix → MediaMTX `phone` path) +
// the KPI banner. "Blank" is an intentionally empty scene — pure black
// output for a hard visual reset (or the safest hold while rearranging).
export const SCREEN_SCENES = ["Sumobots", "Intermission", "Bracket", "Standings", "Leaderboard", "Results", "All Rings", "Vote", "Commentary", "Standby", "Blank"] as const;
export const INTERMISSION_SCENE = SCREEN_SCENES[0];

/**
 * Full-frame phone-camera scenes, one per operator's phone. Each phone pushes
 * RTMP to the MediaMTX path of the same (lowercase) first name — e.g. Victor's
 * phone → rtmp://<obs-host>:1935/victor — and the scene shows that feed
 * full-frame. Created by relay/obs-setup.mjs; names must match OBS exactly.
 */
export const CAMERA_SCENES = ["Victor Cam", "Arjun Cam", "Nirvan Cam", "Dash Cam"] as const;

/**
 * How stale relay_seen_at may be before the panel calls the relay dead.
 * The relay heartbeats every 10s; 25s = one missed beat's grace, so a single
 * dropped write doesn't flap the indicator.
 */
export const RELAY_FRESH_MS = 25_000;

/** Live output telemetry the relay measures each heartbeat while streaming. */
export type StreamStats = {
  /** OBS output timecode, e.g. "01:23:45" — how long we've been live. */
  timecode?: string;
  /** Measured from the encoder's byte-counter delta — real data flowing out. */
  kbps?: number;
  /** Dropped (skipped) frames as a percentage of total output frames. */
  droppedPct?: number;
  /** 0..1 congestion reported by OBS; sustained high values = network trouble. */
  congestion?: number;
};

export type ObsState = {
  currentScene: string;
  streaming: boolean;
  recording: boolean;
  replayBuffer: boolean;
  relaySeenAt: string | null; // ISO; null = relay has never connected
  obsConnected: boolean;
  streamStats: StreamStats;
  /** MediaMTX ingest paths → is a publisher live on it right now. Empty when
   *  feed monitoring is disabled. */
  feedStatus: Record<string, boolean>;
  /** Most recent failed command, shown as a panel banner while fresh. */
  lastError: string | null;
  lastErrorAt: string | null;
  overrideActive: boolean;
  /** 0 = override applies to every ring's lower-third. */
  overrideRing: number;
  overrideLeft: string;
  overrideRight: string;
};

/** Row shape of pickabots_obs_state (see migration 0022). */
export type ObsStateRow = {
  current_scene: string;
  streaming: boolean;
  recording: boolean;
  replay_buffer: boolean;
  relay_seen_at: string | null;
  obs_connected: boolean;
  stream_stats: StreamStats | null;
  feed_status: Record<string, boolean> | null;
  last_error: string | null;
  last_error_at: string | null;
  override_active: boolean;
  override_ring: number;
  override_left: string;
  override_right: string;
};

export function parseObsState(r: ObsStateRow): ObsState {
  return {
    currentScene: r.current_scene,
    streaming: r.streaming,
    recording: r.recording,
    replayBuffer: r.replay_buffer,
    relaySeenAt: r.relay_seen_at,
    obsConnected: r.obs_connected,
    streamStats: r.stream_stats ?? {},
    feedStatus: r.feed_status ?? {},
    lastError: r.last_error,
    lastErrorAt: r.last_error_at,
    overrideActive: r.override_active,
    overrideRing: r.override_ring,
    overrideLeft: r.override_left,
    overrideRight: r.override_right,
  };
}

/** Both sides of the "is the relay alive?" light. */
export function relayIsFresh(state: ObsState, now = Date.now()): boolean {
  return !!state.relaySeenAt && now - new Date(state.relaySeenAt).getTime() < RELAY_FRESH_MS;
}
