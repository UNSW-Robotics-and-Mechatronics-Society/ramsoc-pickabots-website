Attach `parimutuel.ts` to this conversation before sending the prompt below (it has the core payout math already worked out and tested).

---

I want to add a token-based pari-mutuel voting/betting system to the sumobots web app for our RamSoc competition. Here's the context and what I need built.

**Stack:** Next.js (pnpm), Supabase (Postgres + auth via Clerk), deployed on Vercel.

**Concept:** In each round, two robots (Bot A vs Bot B) fight. Users stake tokens on which bot they think will win, before betting closes. When the round resolves, losers' tokens are redistributed to winners proportionally to their stake — so if the crowd is lopsided toward one bot, betting against the crowd pays much more if you're right. This is a standard pari-mutuel model (like horse racing), not fixed-odds betting.

**Core math (already implemented, use this logic, don't reinvent it):**
- `poolA` / `poolB` = total tokens staked on each bot
- `payoutPool = (poolA + poolB) * (1 - rake)` — rake is an optional platform cut, default 0
- If a bot wins: `payoutPerToken = payoutPool / winningPool`, each winner gets `theirBet * payoutPerToken`
- If nobody bet on the winning bot, refund everyone that round instead of computing a payout
- I have a working, tested TypeScript module (`parimutuel.ts`, attached) with `getPools`, `getLiveOdds`, and `resolveRound` functions — reuse these rather than rewriting the math.

**What I need you to build:**

1. **Supabase schema** — migration for a `bets` table (`id`, `round_id`, `user_id`, `bot_choice` enum A/B, `amount`, `payout` nullable, `refunded` boolean, `created_at`) and whatever changes are needed to the existing `rounds` table (add `betting_closes_at`, `status`, `winner`, `resolved_at` if not already present). Also check whether users need a `token_balance` column and add it if missing.

2. **Bet placement API route** — server-side route (App Router, e.g. `app/api/rounds/[id]/bet/route.ts`) that:
   - Verifies the user via Clerk
   - Rejects bets if `betting_closes_at` has passed (server-side check, not client-trusted)
   - Rejects bets exceeding the user's token balance
   - Deducts tokens from balance and inserts the bet, atomically (use a Postgres transaction or RPC function so balance deduction and bet insert can't desync)

3. **Round resolution API route** — e.g. `app/api/rounds/[id]/resolve/route.ts`, admin/organizer-only, that:
   - Pulls all bets for the round from Supabase
   - Calls `resolveRound` from `parimutuel.ts` with the actual winner
   - Writes `payout` and `refunded` back onto each bet row
   - Credits each user's `token_balance` with their payout
   - Marks the round as resolved

4. **Live odds endpoint/hook** — something the frontend can poll or subscribe to (Supabase realtime is fine) that returns `getLiveOdds` output so the UI can show current implied multipliers while betting is still open, and clearly indicate these will shift until betting closes.

5. **Minimal UI wiring** — a bet placement component (pick bot, enter amount, shows live odds/multiplier estimate) and a results view after resolution (shows payout per user, or at least the resolved pool split). Match whatever styling conventions the rest of the sumobots repo already uses — check existing components first rather than inventing a new design language.

**Constraints / things to get right:**
- All balance/payout logic must be server-side and race-condition safe — never trust client-submitted amounts or odds.
- Handle the zero-pool refund case from `parimutuel.ts`.
- Add a reasonable max-bet-per-user-per-round cap (make it a constant I can easily tune, e.g. `MAX_BET_PER_ROUND = 500`) so one user can't dominate the pool.
- Look at how the rest of the repo handles Supabase migrations, RLS policies, and Clerk auth checks before adding new code, and follow those existing patterns.

Start by reading the current `rounds`-related schema and API routes in this repo so you understand what already exists, then propose the migration and route changes before writing code.
