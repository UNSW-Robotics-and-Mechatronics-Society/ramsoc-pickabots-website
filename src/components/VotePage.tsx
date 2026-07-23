'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import Header from './Header'
import Ring, { COMP_META } from './Ring'
import NextMatchCard from './NextMatchCard'
import VoteModal from './VoteModal'
import TeamLedgerModal from './TeamLedgerModal'
import ComicFlash, { useComicFlash } from './ComicFlash'
import Toast, { useToast, WinLossToast, useWinLossToast } from './Toast'
import type { Match, Vote, VoteStandings } from '@/lib/types'

interface ModalCtx {
  matchId: string
  side: 'left' | 'right'
  botName: string
  compType: string
}

type CompFilter = 'standard' | 'open' | 'exhibition'

export default function VotePage() {
  const [matches, setMatches]   = useState<Match[]>([])
  const [tokens, setTokens]     = useState<number | null>(null)
  const [votes, setVotes]       = useState<Record<string, Vote>>({})
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [modalCtx, setModalCtx] = useState<ModalCtx | null>(null)
  const [standings, setStandings] = useState<Record<string, VoteStandings>>({})
  const [selectedTeam, setSelectedTeam] = useState<{ name: string; division?: 'standards' | 'open' } | null>(null)
  const [filter, setFilter]     = useState<CompFilter>('standard')

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
  useEffect(() => { prevMatchesRef.current = matches },  [matches])
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
  }, [])

  // ── Poll live standings for active matches ───────────────────────────────────
  useEffect(() => {
    const activeIds = matches.filter(m => m.is_active).map(m => m.id)
    if (activeIds.length === 0) return
    async function fetchStandings() {
      const results = await Promise.all(
        activeIds.map(id => fetch(`/api/matches/${id}/standings`).then(r => r.json()).catch(() => null))
      )
      setStandings(prev => {
        const next = { ...prev }
        activeIds.forEach((id, i) => { if (results[i]) next[id] = results[i] })
        return next
      })
    }
    fetchStandings()
    const interval = setInterval(fetchStandings, 3000)
    return () => clearInterval(interval)
  }, [matches])

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
  // Standard/Open: always show exactly 2 rings, filling with placeholders if
  // fewer than 2 active matches exist — and never an exhibition match, which
  // gets its own tab instead of mixing into a division's view. Exhibition:
  // no fixed slot count, just show every active exhibition match there is.
  const activeMatches  = matches.filter(m => m.is_active && m.winner_side === null)
  const activeFiltered = filter === 'exhibition'
    ? activeMatches.filter(m => m.is_exhibition)
    : activeMatches.filter(m => m.comp_type === filter && !m.is_exhibition).slice(0, 2)
  const activeBossbots = activeMatches.filter(m => m.comp_type === 'bossbot' && !m.is_exhibition)

  // Next Matches: at most 2 for the selected division; all of them for Exhibition.
  const allNext     = matches.filter(m => !m.is_active && m.winner_side === null)
  const nextVisible = filter === 'exhibition'
    ? allNext.filter(m => m.is_exhibition)
    : allNext.filter(m => m.comp_type === filter && !m.is_exhibition).slice(0, 2)

  return (
    <>
      <Header tokens={tokens ?? 0} loading={loading} />

      <main style={{ padding: '14px 16px 88px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Standard / Open / Exhibition tab */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['standard', 'open', 'exhibition'] as CompFilter[]).map(f => (
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
              {f === 'standard' ? 'Standard' : f === 'open' ? 'Open' : 'Exhibition'}
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

        {/* Standard/Open: 2 rings for the active tab, placeholders fill any empty slots */}
        {!loading && !error && filter !== 'exhibition' && [0, 1].map(i => {
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

        {/* Next Matches — max 2 per division (standard + open) = 4 total */}
        {!loading && !error && nextVisible.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 4 }}>
              Next Matches
            </span>
            {nextVisible.map(match => (
              <NextMatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </main>

      <VoteModal ctx={modalCtx} tokens={tokens ?? 0} onConfirm={handleConfirm} onClose={() => setModalCtx(null)} />
      <TeamLedgerModal target={selectedTeam} onClose={() => setSelectedTeam(null)} />
      <ComicFlash state={flash} />
      <Toast toast={toast} />
      <WinLossToast queue={winLossQueue} onDismiss={dismissWinLoss} />

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
