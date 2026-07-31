'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import Header from './Header'
import FinalsDayBanner from './FinalsDayBanner'
import Ring, { COMP_META } from './Ring'
import NextMatchCard from './NextMatchCard'
import VoteModal from './VoteModal'
import TeamLedgerModal from './TeamLedgerModal'
import ComicFlash, { useComicFlash } from './ComicFlash'
import Toast, { useToast, WinLossToast, useWinLossToast } from './Toast'
import BegDial from './BegDial'
import RamCoin from './RamCoin'
import { BEG_THRESHOLD } from '@/lib/beg-config'
import { hasSeenResult, markResultsSeen } from '@/lib/seenResults'
import type { Match, Vote, VoteStandings, VoteWithResult } from '@/lib/types'

/** GET /api/matches — the match rows plus each division's ring count. */
type MatchesResponse = { matches: Match[]; ringCounts: Record<'standard' | 'open', number> }

interface ModalCtx {
  matchId: string
  side: 'left' | 'right'
  botName: string
  compType: string
}

/**
 * 'finals' is the Finals Day card — both divisions' semis, bronze matches and
 * finals. They share one physical ring and the admin can have any number of
 * them open for bidding at once, so they can't be split across the division
 * tabs the way earlier rounds are; they list together, each labelled with its
 * division and round.
 */
type CompFilter = 'standard' | 'open' | 'exhibition' | 'finals'

type BegBannerState = {
  begsUsed: number
  begsAllowed: number
  cooldownRemaining: number | null
  eligible: boolean
  reason: 'ok' | 'not_broke' | 'active_vote' | 'no_begs_left' | 'cooldown'
}

export default function VotePage() {
  const [matches, setMatches]   = useState<Match[]>([])
  // How many rings each division runs — one ring slot is rendered per ring, so
  // the page shows exactly as many biddable matches as there are live ones.
  const [ringCounts, setRingCounts] = useState<Record<'standard' | 'open', number> | null>(null)
  const [tokens, setTokens]     = useState<number | null>(null)
  const [allIn, setAllIn]       = useState(false)
  const [finalsDay, setFinalsDay] = useState(false)
  const [votes, setVotes]       = useState<Record<string, Vote>>({})
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [modalCtx, setModalCtx] = useState<ModalCtx | null>(null)
  const [standings, setStandings] = useState<Record<string, VoteStandings>>({})
  const [selectedTeam, setSelectedTeam] = useState<{ name: string; division?: 'standards' | 'open' } | null>(null)
  const [filter, setFilter]     = useState<CompFilter>('standard')
  // Set once the player picks a tab themselves, which stops the Finals Day
  // auto-switch below from overriding their choice.
  const pickedTabRef = useRef(false)
  const [begOpen, setBegOpen]   = useState(false)
  const [begState, setBegState] = useState<BegBannerState | null>(null)

  // comp_type is 'standard'/'open'/'bossbot' — map to the app's internal
  // 'standards'/'open' Division naming used as a best-effort disambiguation
  // hint by the team ledger lookup (bossbot has no equivalent, left undefined).
  function handleTeamClick(name: string, compType: string) {
    setSelectedTeam({ name, division: compType === 'standard' ? 'standards' : compType === 'open' ? 'open' : undefined })
  }

  const { state: flash, trigger: triggerFlash } = useComicFlash()
  const { toast, show: showToast } = useToast()
  const { winLossQueue, showWinLoss, dismissWinLoss } = useWinLossToast()

  // Refs let refetchMatches read the latest votes/matches without being in its
  // dependency array — keeping it stable so the Supabase subscription never
  // needlessly reconnects.
  const prevMatchesRef  = useRef<Match[]>([])
  const votesRef        = useRef<Record<string, Vote>>({})
  const showWinLossRef  = useRef(showWinLoss)
  // In-flight vote POSTs, keyed by match, each resolving to the real vote id
  // (or null if the POST failed). "Change Vote" tapped before the POST comes
  // back waits on this rather than sending the optimistic `pending-…` id, which
  // isn't a uuid and made undo_vote fail with a raw Postgres error. Entries are
  // left in place once settled — they're overwritten by the next vote on that
  // match, and only ever read while the local id is still a placeholder.
  const pendingVoteRef  = useRef<Record<string, Promise<string | null>>>({})
  useEffect(() => { prevMatchesRef.current = matches },  [matches])
  useEffect(() => { votesRef.current = votes },          [votes])
  useEffect(() => { showWinLossRef.current = showWinLoss }, [showWinLoss])

  // Finals Day opens the page on the Finals tab: the division ladders are
  // finished by then, so landing on Standard would show nothing but TBD
  // placeholders. The other tabs stay available — this only moves someone who
  // hasn't chosen one yet, so switching back sticks. It can't be an initial
  // state value: the flag arrives with the /api/user fetch, after first paint.
  useEffect(() => {
    if (finalsDay && !pickedTabRef.current) setFilter('finals')
  }, [finalsDay])

  // Beg eligibility (remaining begs + cooldown) for the "Down bad?" banner.
  const refreshBeg = useCallback(async () => {
    try {
      const res = await fetch('/api/beg')
      if (res.ok) setBegState(await res.json())
    } catch { /* non-fatal: banner falls back to its default label */ }
  }, [])
  // Cooldown is measured in completed matches, so re-check when matches change.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refreshBeg() }, [matches, refreshBeg])

  // ── Load on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [matchRes, userRes, votesRes] = await Promise.all([
          fetch('/api/matches'),
          fetch('/api/user'),
          fetch('/api/votes'),
        ])
        if (!matchRes.ok) throw new Error('Failed to load matches')
        if (!userRes.ok)  throw new Error('Failed to load user data')
        if (!votesRes.ok) throw new Error('Failed to load votes')

        const [matchData, userData, votesData] = await Promise.all([
          matchRes.json() as Promise<MatchesResponse>,
          userRes.json(),
          votesRes.json() as Promise<VoteWithResult[]>,
        ])
        setMatches(matchData.matches)
        setRingCounts(matchData.ringCounts)
        // Pre-seed the ref so refetchMatches doesn't treat already-resolved
        // matches as new resolutions if Realtime fires right after page load.
        prevMatchesRef.current = matchData.matches
        if (userData._supabaseError) console.error('[VotePage] Supabase error:', userData._supabaseError)
        setTokens(userData.tokens)
        setAllIn(!!userData.allIn)
        setFinalsDay(!!userData.finalsDay)

        const votesByMatch: Record<string, Vote> = {}
        for (const v of votesData) {
          votesByMatch[v.match_id] = {
            id: v.id, match_id: v.match_id, side: v.side, amount: v.amount,
            // The server knows the bot's name, so a vote loaded on a fresh page
            // is as complete as one placed in this session.
            botName: v.side === 'left' ? v.left_name : v.right_name,
          }
        }
        setVotes(votesByMatch)
        votesRef.current = votesByMatch

        // Results the player never saw — the win/loss screen lives only on this
        // page, so anything decided while they were elsewhere is shown now.
        const missed = votesData.filter(v => v.winner_side && !hasSeenResult(v.match_id))
        for (const v of missed) {
          const name = v.side === 'left' ? v.left_name : v.right_name
          // allIn isn't persisted, so a replayed win never gets the jackpot
          // treatment — see the note on Vote.allIn.
          showWinLossRef.current(v.side === v.winner_side ? 'win' : 'loss', name)
        }
        markResultsSeen(missed.map(v => v.match_id))
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Poll live standings (odds) for active matches ─────────────────────────────
  // One batched, server-cached request per tick (see /api/standings) rather than
  // one request per active match, so a room full of viewers is a single vote
  // scan every couple of seconds instead of hundreds of requests per second.
  useEffect(() => {
    const hasActive = matches.some(m => m.is_active || m.voting_open)
    if (!hasActive) return
    let cancelled = false
    async function fetchStandings() {
      try {
        const res = await fetch('/api/standings')
        if (!res.ok) return
        const batch = await res.json() as Record<string, VoteStandings>
        if (!cancelled) setStandings(prev => ({ ...prev, ...batch }))
      } catch { /* transient — next tick retries */ }
    }
    fetchStandings()
    const interval = setInterval(fetchStandings, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [matches])

  // ── Live match updates ────────────────────────────────────────────────────────
  const refetchMatches = useCallback(async () => {
    try {
      const matchRes = await fetch('/api/matches')
      if (!matchRes.ok) return
      const payload: MatchesResponse = await matchRes.json()
      const newMatches = payload.matches

      // Detect newly-resolved matches the user voted on and show the big toast.
      let wonOrLost = false
      const shown: string[] = []
      for (const m of newMatches) {
        if (!m.winner_side) continue
        const prev = prevMatchesRef.current.find(p => p.id === m.id)
        if (prev?.winner_side) continue // already resolved before this tick
        const vote = votesRef.current[m.id]
        if (!vote) continue // user didn't vote on this match
        const won = vote.side === m.winner_side
        const name = vote.side === 'left' ? m.left_name : m.right_name
        // Gold + confetti only when an ALL-IN bet actually wins.
        showWinLossRef.current(won ? 'win' : 'loss', name, won && !!vote.allIn)
        wonOrLost = true
        shown.push(m.id)
      }
      // Recorded so leaving and coming back doesn't replay what was just shown.
      markResultsSeen(shown)

      setMatches(newMatches)
      setRingCounts(payload.ringCounts)

      // Delay the token balance refresh on a win/loss so the toast is visible
      // before the balance updates (gives the payout a moment to process too).
      const refreshTokens = async () => {
        const userRes = await fetch('/api/user')
        if (userRes.ok) {
          const u = await userRes.json()
          setTokens(u.tokens)
          setAllIn(!!u.allIn)
          setFinalsDay(!!u.finalsDay)
        }
      }
      if (wonOrLost) {
        setTimeout(refreshTokens, 2500)
      } else {
        refreshTokens()
      }
    } catch {
      /* transient — next event/tick retries */
    }
  }, [])

  useEffect(() => {
    const sb = getBrowserSupabase()
    if (sb) {
      const channel = sb
        .channel('public:matches')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => { refetchMatches() })
        .subscribe()
      return () => { sb.removeChannel(channel) }
    }
    const id = setInterval(refetchMatches, 5000)
    return () => clearInterval(id)
  }, [refetchMatches])

  // ── Open vote modal ───────────────────────────────────────────────────────────
  function handleVote(matchId: string, side: 'left' | 'right', botName: string, compType: string) {
    if (votes[matchId])      { showToast(`Already voted on ${votes[matchId].botName}! Undo to change.`); return }
    if ((tokens ?? 0) < 1) { showToast('Not enough tokens!'); return }
    setModalCtx({ matchId, side, botName, compType })
  }

  // ── Confirm vote ──────────────────────────────────────────────────────────────
  async function handleConfirm(amount: number) {
    if (!modalCtx) return
    const { matchId, side, botName } = modalCtx
    setModalCtx(null)

    const current = tokens ?? 0
    if (current < amount) { showToast('Not enough tokens!'); return }

    // All-in = staked the entire balance. Tracked on the vote so its win can
    // trigger the gold/confetti screen (see refetchMatches).
    const wentAllIn = current > 0 && amount >= current
    const optimisticVote: Vote = { id: `pending-${matchId}`, match_id: matchId, side, amount, botName, allIn: wentAllIn }
    setVotes(prev => ({ ...prev, [matchId]: optimisticVote }))
    setTokens(current - amount)
    triggerFlash()
    showToast(<><RamCoin size={13} style={{ marginRight: 5 }}/>{amount} locked on {botName}!</>)

    const request = (async () => {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: matchId, side, amount }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Vote failed')
      return body as { vote: { id: string }; tokens: number }
    })()

    // Published before awaiting, so an undo tapped while this is still in flight
    // can wait for the real vote id instead of sending the placeholder.
    pendingVoteRef.current[matchId] = request.then(b => b.vote.id, () => null)

    try {
      const body = await request
      setVotes(prev => ({ ...prev, [matchId]: { ...optimisticVote, id: body.vote.id } }))
      setTokens(body.tokens)
    } catch (e: unknown) {
      setVotes(prev => { const next = { ...prev }; delete next[matchId]; return next })
      setTokens(current)
      showToast(`⚠️ ${e instanceof Error ? e.message : 'Vote failed'}`)
    }
  }

  // ── Undo vote ─────────────────────────────────────────────────────────────────
  async function handleUndo(matchId: string) {
    const vote = votes[matchId]
    if (!vote) return

    // A vote placed a moment ago may still be in flight, in which case its id is
    // the optimistic placeholder. Wait for the POST to hand back the real one
    // rather than asking undo_vote to delete "pending-…".
    let voteId = vote.id
    if (voteId.startsWith('pending-')) {
      const resolved = await pendingVoteRef.current[matchId]
      // No real id means the vote itself failed — handleConfirm has already
      // rolled the optimistic state back, so there's nothing left to undo.
      if (!resolved) { showToast('Vote didn\'t go through — nothing to undo'); return }
      voteId = resolved
    }

    // Functional updates (not a value captured before the await above), so the
    // refund applies to whatever the balance is by the time we get here.
    setVotes(prev => { const next = { ...prev }; delete next[matchId]; return next })
    setTokens(t => (t ?? 0) + vote.amount)
    showToast('Vote undone ↩️')

    try {
      const res = await fetch(`/api/votes?vote_id=${voteId}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Undo failed')
      setTokens(body.tokens)
    } catch (e: unknown) {
      setVotes(prev => ({ ...prev, [matchId]: vote }))
      setTokens(t => (t ?? 0) - vote.amount)
      showToast(`⚠️ ${e instanceof Error ? e.message : 'Undo failed'}`)
    }
  }

  // ── Match bucketing ───────────────────────────────────────────────────────────
  // Every live match is biddable — no cap. The schedule makes at most one match
  // active per ring, so the count follows the ring count on its own, and the
  // rings that have no ready match yet get a "TBD" placeholder (see slotCount).
  // Exhibition matches never mix into a division's view; they have their own
  // tab. Finals are kept out of the division tabs for the same reason — they
  // carry their division's comp_type, but they belong to the Finals tab, which
  // shows both divisions' together (see CompFilter).
  const activeMatches  = matches.filter(m => m.is_active && m.winner_side === null)
  const activeFiltered = filter === 'exhibition'
    ? activeMatches.filter(m => m.is_exhibition)
    : activeMatches.filter(m => m.comp_type === filter && !m.is_exhibition && !m.is_finals)
  const activeBossbots = activeMatches.filter(m => m.comp_type === 'bossbot' && !m.is_exhibition)

  // One slot per ring this division is running. Falls back to "just the live
  // matches" if the ring count hasn't loaded, and never drops below 1 so an
  // idle division still shows a placeholder rather than nothing at all.
  const slotCount = Math.max(
    filter === 'standard' || filter === 'open' ? (ringCounts?.[filter] ?? 0) : 0,
    activeFiltered.length,
    1,
  )

  // Next Matches: all of them — one per ring, same as the active ones.
  const allNext     = matches.filter(m => !m.is_active && m.winner_side === null)
  const nextVisible = filter === 'exhibition'
    ? allNext.filter(m => m.is_exhibition)
    : allNext.filter(m => m.comp_type === filter && !m.is_exhibition && !m.is_finals)

  // Finals Day: the whole card at once, in running order, rather than one slot
  // per ring — all eight share a single ring, and the admin opens bidding on
  // them individually, so there's no "the live one" to single out. Cards whose
  // bidding is shut still show, read-only, so the crowd can see what's coming.
  const finalsVisible = matches
    .filter(m => m.is_finals && m.winner_side === null)
    .sort((a, b) => (a.finals_order ?? 0) - (b.finals_order ?? 0))

  return (
    <>
      <Header tokens={tokens ?? 0} loading={loading} />

      {finalsDay && (
        <div style={{ padding: '10px 16px 0' }}>
          <FinalsDayBanner />
        </div>
      )}

      <main style={{ padding: '14px 16px 88px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Beg for tokens — shown only when running low. Subline surfaces begs
            remaining + any cooldown so players see their status before opening. */}
        {tokens !== null && tokens < BEG_THRESHOLD && (() => {
          const remaining = begState ? Math.max(0, begState.begsAllowed - begState.begsUsed) : null
          const subline =
            begState?.reason === 'no_begs_left'
              ? 'No begs remaining'
              : begState?.reason === 'active_vote'
                ? 'Finish your live vote first'
                : begState?.reason === 'cooldown'
                  ? `Available in ${begState.cooldownRemaining} match${begState.cooldownRemaining === 1 ? '' : 'es'} · ${remaining} left`
                  : remaining !== null
                    ? `${remaining} beg${remaining === 1 ? '' : 's'} left`
                    : null
          const spent = begState?.reason === 'no_begs_left' || begState?.reason === 'active_vote'
          return (
            <button
              onClick={() => setBegOpen(true)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                padding: '12px 16px', borderRadius: 14, cursor: 'pointer',
                border: '1px solid rgba(255,180,0,0.35)',
                background: 'linear-gradient(135deg, rgba(255,107,0,0.16) 0%, rgba(155,48,255,0.08) 100%)',
                backdropFilter: 'blur(14px)',
                boxShadow: '0 0 20px rgba(255,180,0,0.12)',
                textTransform: 'uppercase', color: '#FFD700',
                textShadow: '0 0 10px rgba(255,215,0,0.4)',
                opacity: spent ? 0.55 : 1,
              }}
            >
              <span style={{ fontSize: '0.72rem', fontWeight: 900, letterSpacing: 2 }}>
                <RamCoin size={13} style={{ marginRight: 6 }}/>Down bad? Beg Rambo for RamCoins
              </span>
              {subline && (
                <span style={{ fontSize: '0.5rem', fontWeight: 900, letterSpacing: 2, color: 'rgba(255,215,0,0.65)' }}>
                  {subline}
                </span>
              )}
            </button>
          )
        })()}

        {/* Standard / Open / Exhibition / Finals tab */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['standard', 'open', 'exhibition', 'finals'] as CompFilter[]).map(f => (
            <button
              key={f}
              onClick={() => { pickedTabRef.current = true; setFilter(f) }}
              style={{
                padding: '6px 16px', borderRadius: 999, fontSize: '0.6rem', fontWeight: 900,
                letterSpacing: 2, textTransform: 'uppercase', cursor: 'pointer',
                border: `1px solid ${filter === f ? 'rgba(255,107,0,0.6)' : 'rgba(255,255,255,0.1)'}`,
                background: filter === f ? 'rgba(255,107,0,0.15)' : 'rgba(255,255,255,0.04)',
                color: filter === f ? '#FF6B00' : 'rgba(255,255,255,0.4)',
              }}
            >
              {f === 'standard' ? 'Standard' : f === 'open' ? 'Open' : f === 'exhibition' ? 'Exhibition' : 'Finals'}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, padding:'48px 0' }}>
            <div style={{
              width:32, height:32, border:'3px solid #222', borderTopColor:'#FF6B00',
              borderRadius:'50%', animation:'spin 0.7s linear infinite',
            }}/>
            <span style={{ fontSize:'0.85rem', fontWeight:900, color:'#555', textTransform:'uppercase', letterSpacing:3 }}>
              Loading…
            </span>
          </div>
        )}

        {error && (
          <div style={{
            padding:20, background:'rgba(30,0,0,0.8)', border:'1px solid rgba(255,45,45,0.4)',
            borderRadius:12, color:'#ff6666', fontSize:'0.8rem', fontWeight:900, textAlign:'center',
            backdropFilter:'blur(12px)', letterSpacing:2,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Exhibition: every active exhibition match, no fixed slot count and
            no placeholders (there's no "always 2" concept for ad-hoc matches). */}
        {!loading && !error && filter === 'exhibition' && (
          activeFiltered.length > 0
            ? activeFiltered.map(match => (
                <Ring
                  key={match.id}
                  match={match}
                  vote={votes[match.id] ?? null}
                  standings={standings[match.id] ?? null}
                  votingOpen={match.voting_open}
                  onVote={side => handleVote(match.id, side, side === 'left' ? match.left_name : match.right_name, match.comp_type)}
                  onUndo={() => handleUndo(match.id)}
                  onTeamClick={name => handleTeamClick(name, match.comp_type)}
                />
              ))
            : (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#444', fontWeight: 900, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 3 }}>
                No exhibition matches right now.
              </div>
            )
        )}

        {/* Finals Day: the whole card, in running order. Bidding is opened per
            match by the admin, so an open one is a live Ring and a shut one is
            the read-only preview card — no ring slots, no placeholders. */}
        {!loading && !error && filter === 'finals' && (
          finalsVisible.length > 0
            ? finalsVisible.map(match => (
                match.voting_open
                  ? <Ring
                      key={match.id}
                      match={match}
                      vote={votes[match.id] ?? null}
                      standings={standings[match.id] ?? null}
                      votingOpen={match.voting_open}
                      onVote={side => handleVote(match.id, side, side === 'left' ? match.left_name : match.right_name, match.comp_type)}
                      onUndo={() => handleUndo(match.id)}
                      onTeamClick={name => handleTeamClick(name, match.comp_type)}
                    />
                  : <NextMatchCard
                      key={match.id}
                      match={match}
                      onTeamClick={name => handleTeamClick(name, match.comp_type)}
                    />
              ))
            : (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#444', fontWeight: 900, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 3 }}>
                Finals aren&apos;t set yet.
              </div>
            )
        )}

        {/* Standard/Open: one ring per ring in the schedule, placeholders fill any empty slots */}
        {!loading && !error && filter !== 'exhibition' && filter !== 'finals' && Array.from({ length: slotCount }, (_, i) => {
          const match = activeFiltered[i] ?? null
          return match
            ? <Ring
                key={match.id}
                match={match}
                vote={votes[match.id] ?? null}
                standings={standings[match.id] ?? null}
                votingOpen={match.voting_open}
                onVote={side => handleVote(match.id, side, side === 'left' ? match.left_name : match.right_name, match.comp_type)}
                onUndo={() => handleUndo(match.id)}
                onTeamClick={name => handleTeamClick(name, match.comp_type)}
              />
            : <PlaceholderRing key={`ph-${i}`} compType={filter} />
        })}

        {/* Bossbot rings — extras, shown when present */}
        {!loading && !error && activeBossbots.map(match => (
          <Ring
            key={match.id}
            match={match}
            vote={votes[match.id] ?? null}
            standings={standings[match.id] ?? null}
            votingOpen={match.voting_open}
            onVote={side => handleVote(match.id, side, side === 'left' ? match.left_name : match.right_name, match.comp_type)}
            onUndo={() => handleUndo(match.id)}
            onTeamClick={name => handleTeamClick(name, match.comp_type)}
          />
        ))}

        {/* Next Matches — one per ring, whatever the schedule has queued up */}
        {!loading && !error && nextVisible.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 4 }}>
              Next Matches
            </span>
            {nextVisible.map(match => (
              // A "next" match with voting opened by the admin is biddable
              // just like an active one — the read-only card is only for
              // the ones still waiting on that.
              match.voting_open
                ? <Ring
                    key={match.id}
                    match={match}
                    vote={votes[match.id] ?? null}
                    standings={standings[match.id] ?? null}
                    votingOpen={match.voting_open}
                    onVote={side => handleVote(match.id, side, side === 'left' ? match.left_name : match.right_name, match.comp_type)}
                    onUndo={() => handleUndo(match.id)}
                    onTeamClick={name => handleTeamClick(name, match.comp_type)}
                  />
                : <NextMatchCard
                    key={match.id}
                    match={match}
                    onTeamClick={name => handleTeamClick(name, match.comp_type)}
                  />
            ))}
          </div>
        )}
      </main>

      <VoteModal
        ctx={modalCtx}
        tokens={tokens ?? 0}
        allIn={allIn}
        standings={modalCtx ? standings[modalCtx.matchId] ?? null : null}
        onConfirm={handleConfirm}
        onClose={() => setModalCtx(null)}
      />
      <TeamLedgerModal target={selectedTeam} onClose={() => setSelectedTeam(null)} />
      <ComicFlash state={flash} />
      <Toast toast={toast} />
      <WinLossToast queue={winLossQueue} onDismiss={dismissWinLoss} />
      {begOpen && <BegDial onClose={() => setBegOpen(false)} onAwarded={t => { setTokens(t); refreshBeg() }} />}

      <style>{`@keyframes spin { to{transform:rotate(360deg)} }`}</style>
    </>
  )
}

// ── TBD placeholder shown when no match is active for a division ──────────────
function PlaceholderRing({ compType }: { compType: 'standard' | 'open' }) {
  const meta = COMP_META[compType]
  return (
    <div style={{
      position: 'relative', borderRadius: 14,
      border: `1px solid color-mix(in srgb, ${meta.color} 12%, transparent)`,
      background: 'rgba(3,1,8,0.15)',
      backdropFilter: 'blur(14px)',
      minHeight: 140,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 10,
      opacity: 0.35,
    }}>
      <div style={{
        fontSize: '0.48rem', fontWeight: 900, color: meta.color,
        textTransform: 'uppercase', letterSpacing: 4,
      }}>
        {meta.label}
      </div>
      <div style={{
        fontSize: '1.1rem', fontWeight: 900,
        color: 'rgba(255,255,255,0.25)', letterSpacing: 6,
        textTransform: 'uppercase',
      }}>
        TBD  vs  TBD
      </div>
      <div style={{
        fontSize: '0.48rem', fontWeight: 900,
        color: 'rgba(255,255,255,0.18)', letterSpacing: 3,
        textTransform: 'uppercase',
      }}>
        Match coming up
      </div>
    </div>
  )
}
