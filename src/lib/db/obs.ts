import "server-only";
import supabase from "@/lib/supabase";
import { type ObsAction, type ObsState, type ObsStateRow, parseObsState } from "@/lib/obs";

/**
 * Uncached on purpose, unlike the bracket reads: this is a single-row select,
 * and its consumers are exactly seven browser contexts (six OBS browser
 * sources + the admin's control panel), not a crowd — while staleness here is
 * uniquely visible ("relay connected" light lying, an override lingering on
 * stream after the admin cleared it). Freshness is worth one row per refresh.
 */
export async function getObsState(): Promise<ObsState> {
  const { data, error } = await supabase
    .from("pickabots_obs_state")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) throw new Error(`Failed to load pickabots_obs_state: ${error.message}`);
  return parseObsState(data as ObsStateRow);
}

/**
 * Queues one command for the relay agent. The INSERT is the delivery
 * mechanism — the relay subscribes to this table over Realtime (service role,
 * RLS bypassed) and executes on arrival; there is no direct call path from
 * here to OBS. Fire-and-forget by design: the button press "succeeds" when
 * queued, and the panel learns the real outcome from pickabots_obs_state,
 * which the relay updates from OBS's own events after executing.
 */
export async function enqueueObsCommand(
  action: ObsAction,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase
    .from("pickabots_obs_commands")
    .insert({ action, payload });
  if (error) throw new Error(`Failed to enqueue OBS command: ${error.message}`);
}

/**
 * Sets/clears the manual "Now Battling" lower-third override. Overlays react
 * via their Realtime subscription to this table — no OBS round-trip involved
 * (the overlay is a browser source; OBS just composites whatever it shows).
 */
export async function setObsOverride(override: {
  active: boolean;
  ring: number;
  left: string;
  right: string;
}): Promise<void> {
  const { error } = await supabase
    .from("pickabots_obs_state")
    .update({
      override_active: override.active,
      override_ring: override.ring,
      override_left: override.left,
      override_right: override.right,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(`Failed to set OBS override: ${error.message}`);
}
