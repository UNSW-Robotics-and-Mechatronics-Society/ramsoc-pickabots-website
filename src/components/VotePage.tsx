'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import Header from './Header'
import Ring, { COMP_META } from './Ring'
import NextMatchCard from './NextMatchCard'
import VoteModal from './VoteModal'
import ComicFlash, { useComicFlash } from './ComicFlash'
import Toast, { useToast, WinLossToast, useWinLossToast } from './Toast'
import BegDial from './BegDial'
import { BEG_THRESHOLD } from '@/lib/beg-config'
import type { Match, Vote, VoteStandings } from '@/lib/types'
import { standingsFromMatch } from '@/lib/vote-pool'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

interface ModalCtx {
  matchId: string
  side: 'left' | 'right'
  botName: string
  compType: string
}

type CompFilter = 'standard' | 'open'

type BegBannerState = {
  begsUsed: number
  begsAllowed: number
  cooldownRemaining: number | null
  eligible: boolean
  reason: 'ok' | 'not_broke' | 'no_begs_left' | 'cooldown'
}

export default function VotePage() {
  const [matches, setMatches]   = useState<Match[]>([])
  const [tokens, setTokens]     = useState<number | null>(null)
  const [votes, setVotes]       = useState<Record<string, Vote>>({})
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [modalCtx, setModalCtx] = useState<ModalCtx | null>(null)
  // Odds are derived from the pool totals carried on each match row (pushed via
  // Realtime / initial fetch) — no per-match standings poll needed.
  const standings = useMemo<Record<string, VoteStandings>>(
    () => Object.fromEntries(matches.map(m => [m.id, standingsFromMatch(m)])),
    [matches],
  )
  const [filter, setFilter]     = useState<CompFilter>('standard')
  const [begOpen, setBegOpen]   = useState(false)
  const [begState, setBegState] = useState<BegBannerState | null>(null)

  // Beg eligibility (remaining begs + cooldown) for the banner. Refreshed on
  // load, after a beg, and whenever matches change (cooldown counts matches).
  const refreshBeg = useCallback(async () => {
    try {
      const res = await fetch('/api/beg')
      if (res.ok) setBegState(await res.json())
    } catch { /* non-fatal: banner falls back to its default label */ }
  }, [])

  const { state: flash, trigger: triggerFlash } = useComicFlash()
  const { toast, show: showToast } = useToast()
  const { winLossState, showWinLoss } = useWinLossToast()

  // Refs let refetchMatches read the latest votes/matches without being in its
  // dependency array — keeping it stable so the Supabase subscription never
  // needlessly reconnects.
  const prevMatchesRef  = useRef<Match[]>([])
  const votesRef        = useRef<Record<string, Vote>>({})
  const showWinLossRef  = useRef(showWinLoss)
  useEffect(() => { prevMatchesRef.current = matches },  [matches])
  // Cooldown is measured in completed matches, so re-check eligibility whenever
  // the match set changes (a match finishing may clear a cooldown).
  // refreshBeg is async (setState happens after the fetch resolves, not
  // synchronously in the effect body).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refreshBeg() }, [matches, refreshBeg])
  useEffect(() => { votesRef.current = votes },          [votes])
  useEffect(() => { showWinLossRef.current = showWinLoss }, [showWinLoss])

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

        const [matchData, userData, votesData] = await Promise.all([matchRes.json(), userRes.json(), votesRes.json()])
        setMatches(matchData)
        // Pre-seed the ref so refetchMatches doesn't treat already-resolved
        // matches as new resolutions if Realtime fires right after page load.
        prevMatchesRef.current = matchData
        if (userData._supabaseError) console.error('[VotePage] Supabase error:', userData._supabaseError)
        setTokens(userData.tokens)
        refreshBeg()

        const votesByMatch: Record<string, Vote> = {}
        for (const v of votesData as Vote[]) votesByMatch[v.match_id] = v
        setVotes(votesByMatch)
        votesRef.current = votesByMatch
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [refreshBeg])

  // (Standings are no longer polled — see the `standings` useMemo above, fed by
  //  the pool_left/right columns that arrive on each match row via Realtime.)

  // ── Live match updates ────────────────────────────────────────────────────────
  const refetchMatches = useCallback(async () => {
    try {
      const matchRes = await fetch('/api/matches')
      if (!matchRes.ok) return
      const newMatches: Match[] = await matchRes.json()

      // Detect newly-resolved matches the user voted on and show the big toast.
      let wonOrLost = false
      for (const m of newMatches) {
        if (!m.winner_side) continue
        const prev = prevMatchesRef.current.find(p => p.id === m.id)
        if (prev?.winner_side) continue // already resolved before this tick
        const vote = votesRef.current[m.id]
        if (!vote) continue // user didn't vote on this match
        const won = vote.side === m.winner_side
        const name = vote.side === 'left' ? m.left_name : m.right_name
        showWinLossRef.current(won ? 'win' : 'loss', name)
        wonOrLost = true
      }

      setMatches(newMatches)

      // Delay the token balance refresh on a win/loss so the toast is visible
      // before the balance updates (gives the payout a moment to process too).
      const refreshTokens = async () => {
        const userRes = await fetch('/api/user')
        if (userRes.ok) setTokens((await userRes.json()).tokens)
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

  const refreshTokens = useCallback(async () => {
    try {
      const r = await fetch('/api/user')
      if (r.ok) setTokens((await r.json()).tokens)
    } catch { /* transient */ }
  }, [])

  // Realtime: merge only the changed match row from the payload — no full
  // /api/matches refetch, so a pool update on every vote does NOT trigger a
  // 200-client refetch storm. Odds recompute from the row's pool columns.
  const handleRealtimeMatch = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType === 'DELETE') {
        const oldId = (payload.old as { id?: string } | null)?.id
        if (oldId) setMatches(prev => prev.filter(m => m.id !== oldId))
        return
      }
      const row = payload.new as unknown as Match
      if (!row?.id) return
      // Win/loss toast on the transition to resolved (compare against local prev,
      // since Realtime's `old` only carries the primary key by default).
      const prev = prevMatchesRef.current.find(p => p.id === row.id)
      if (row.winner_side && !prev?.winner_side) {
        const vote = votesRef.current[row.id]
        if (vote) {
          const won = vote.side === row.winner_side
          const name = vote.side === 'left' ? row.left_name : row.right_name
          showWinLossRef.current(won ? 'win' : 'loss', name)
          setTimeout(refreshTokens, 2500)
        }
      }
      setMatches(cur => {
        const idx = cur.findIndex(m => m.id === row.id)
        if (idx === -1) return [...cur, row]
        const next = [...cur]
        next[idx] = row
        return next
      })
    },
    [refreshTokens],
  )

  useEffect(() => {
    const sb = getBrowserSupabase()
    if (sb) {
      const channel = sb
        .channel('public:matches')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, handleRealtimeMatch)
        .subscribe()
      return () => { sb.removeChannel(channel) }
    }
    // Fallback when Realtime isn't configured (no anon key): poll /api/matches
    // (which now carries the pools, so odds still update ~every 5s).
    const id = setInterval(refetchMatches, 5000)
    return () => clearInterval(id)
  }, [handleRealtimeMatch, refetchMatches])

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

    const optimisticVote: Vote = { id: `pending-${matchId}`, match_id: matchId, side, amount, botName }
    setVotes(prev => ({ ...prev, [matchId]: optimisticVote }))
    setTokens(current - amount)
    triggerFlash()
    showToast(`🪙 ${amount} locked on ${botName}!`)

    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: matchId, side, amount }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Vote failed')
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

    const refunded = (tokens ?? 0) + vote.amount
    setVotes(prev => { const next = { ...prev }; delete next[matchId]; return next })
    setTokens(refunded)
    showToast('Vote undone ↩️')

    try {
      const res = await fetch(`/api/votes?vote_id=${vote.id}`, { method: 'DELETE' })
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
  // Always show exactly 2 rings for the selected division, filling with
  // placeholders if fewer than 2 active matches exist. Bossbots are extras.
  const activeMatches  = matches.filter(m => m.is_active && m.winner_side === null)
  const activeFiltered = activeMatches.filter(m => m.comp_type === filter).slice(0, 2)
  const activeBossbots = activeMatches.filter(m => m.comp_type === 'bossbot')

  // Next Matches: at most 2 for the selected division.
  const allNext     = matches.filter(m => !m.is_active && m.winner_side === null)
  const nextVisible = allNext.filter(m => m.comp_type === filter).slice(0, 2)

  return (
    <>
      <Header tokens={tokens ?? 0} loading={loading} />

      <main style={{ padding: '14px 16px 88px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Beg for tokens — shown only when running low. Subline surfaces begs
            remaining + any cooldown so players see their status before opening. */}
        {tokens !== null && tokens < BEG_THRESHOLD && (() => {
          const remaining = begState ? Math.max(0, begState.begsAllowed - begState.begsUsed) : null
          const subline =
            begState?.reason === 'no_begs_left'
              ? 'No begs remaining'
              : begState?.reason === 'cooldown'
                ? `Available in ${begState.cooldownRemaining} match${begState.cooldownRemaining === 1 ? '' : 'es'} · ${remaining} left`
                : remaining !== null
                  ? `${remaining} beg${remaining === 1 ? '' : 's'} left`
                  : null
          const spent = begState?.reason === 'no_begs_left'
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
                🪙 Down bad? Beg for tokens
              </span>
              {subline && (
                <span style={{ fontSize: '0.5rem', fontWeight: 900, letterSpacing: 2, color: 'rgba(255,215,0,0.65)' }}>
                  {subline}
                </span>
              )}
            </button>
          )
        })()}

        {/* Standard / Open tab */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['standard', 'open'] as CompFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 16px', borderRadius: 999, fontSize: '0.6rem', fontWeight: 900,
                letterSpacing: 2, textTransform: 'uppercase', cursor: 'pointer',
                border: `1px solid ${filter === f ? 'rgba(255,107,0,0.6)' : 'rgba(255,255,255,0.1)'}`,
                background: filter === f ? 'rgba(255,107,0,0.15)' : 'rgba(255,255,255,0.04)',
                color: filter === f ? '#FF6B00' : 'rgba(255,255,255,0.4)',
              }}
            >
              {f === 'standard' ? 'Standard' : 'Open'}
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

        {/* 2 rings for the active tab, placeholders fill any empty slots */}
        {!loading && !error && [0, 1].map(i => {
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
          />
        ))}

        {/* Next Matches — max 2 per division (standard + open) = 4 total */}
        {!loading && !error && nextVisible.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: '0.55rem', fontWeight: 900, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 4 }}>
              Next Matches
            </span>
            {nextVisible.map(match => (
              <NextMatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </main>

      <VoteModal ctx={modalCtx} tokens={tokens ?? 0} onConfirm={handleConfirm} onClose={() => setModalCtx(null)} />
      <ComicFlash state={flash} />
      <Toast toast={toast} />
      <WinLossToast state={winLossState} />
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
