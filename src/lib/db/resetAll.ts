import "server-only";
import supabase from "@/lib/supabase";

/**
 * Wipes every user's voting history and balance, and every voting-mirror
 * match row. Does NOT touch users/teams/special_teams rows themselves (only
 * users.tokens), and does not touch bracket_matches/bracket_schedule — the
 * bracket-wide clear (both divisions, dropping exhibition matches) and its
 * schedule reset are handled separately via the existing bracket-save flow
 * (see AdminPageClient.handleResetAll), which already refunds/deletes any
 * votes tied to matches it invalidates. This goes further: a full wipe of
 * ALL historical votes (including ones on already-resolved matches) and a
 * flat reset of every balance, for a clean restart before a live event.
 */
export async function resetTokensAndHistory(): Promise<void> {
  const { error: votesErr } = await supabase.from("votes").delete().not("id", "is", null);
  if (votesErr) throw new Error(`Failed to clear votes: ${votesErr.message}`);

  const { error: matchesErr } = await supabase.from("matches").delete().not("id", "is", null);
  if (matchesErr) throw new Error(`Failed to clear matches: ${matchesErr.message}`);

  const { error: usersErr } = await supabase.from("users").update({ tokens: 100 }).not("id", "is", null);
  if (usersErr) throw new Error(`Failed to reset tokens: ${usersErr.message}`);
}
