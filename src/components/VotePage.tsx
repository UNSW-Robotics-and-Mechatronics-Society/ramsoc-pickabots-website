'use client'
import { useState, useEffect } from 'react'
import Header from './Header'
import Ring from './Ring'
import BetModal from './BetModal'
import ComicFlash, { useComicFlash } from './ComicFlash'
import Toast, { useToast } from './Toast'
import type { Match, Bet } from '@/lib/types'

interface ModalCtx {
  matchId: string
  side: 'left' | 'right'
  botName: string
  compType: string
}

export default function VotePage() {
  const [matches, setMatches]   = useState<Match[]>([])
  const [tokens, setTokens]     = useState<number | null>(null)
  const [bets, setBets]         = useState<Record<string, Bet>>({})
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [modalCtx, setModalCtx] = useState<ModalCtx | null>(null)

  const { state: flash, trigger: triggerFlash } = useComicFlash()
  const { toast, show: showToast } = useToast()

  // ── Load on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [matchRes, userRes, betsRes] = await Promise.all([
          fetch('/api/matches'),
          fetch('/api/user'),
          fetch('/api/bets'),
        ])
        if (!matchRes.ok) throw new Error('Failed to load matches')
        if (!userRes.ok)  throw new Error('Failed to load user data')
        if (!betsRes.ok)  throw new Error('Failed to load bets')

        const [matchData, userData, betsData] = await Promise.all([matchRes.json(), userRes.json(), betsRes.json()])
        setMatches(matchData)
        if (userData._supabaseError) console.error('[VotePage] Supabase error:', userData._supabaseError)
        setTokens(userData.tokens)

        const betsByMatch: Record<string, Bet> = {}
        for (const b of betsData as Bet[]) betsByMatch[b.match_id] = b
        setBets(betsByMatch)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Open bet modal ────────────────────────────────────────────────────────────
  function handleVote(matchId: string, side: 'left' | 'right', botName: string, compType: string) {
    if (bets[matchId])      { showToast(`Already bet on ${bets[matchId].botName}! Undo to change.`); return }
    if ((tokens ?? 0) < 1) { showToast('Not enough tokens!'); return }
    setModalCtx({ matchId, side, botName, compType })
  }

  // ── Confirm bet ───────────────────────────────────────────────────────────────
  // Token accounting happens server-side in POST /api/bets (deduct + validate
  // atomically) — this only optimistically reflects it, then reconciles with
  // the server's returned balance (or reverts on failure).
  async function handleConfirm(amount: number) {
    if (!modalCtx) return
    const { matchId, side, botName } = modalCtx
    setModalCtx(null)

    const current = tokens ?? 0
    if (current < amount) { showToast('Not enough tokens!'); return }

    const optimisticBet: Bet = { id: `pending-${matchId}`, match_id: matchId, side, amount, botName }
    setBets(prev => ({ ...prev, [matchId]: optimisticBet }))
    setTokens(current - amount)
    triggerFlash()
    showToast(`🪙 ${amount} locked on ${botName}!`)

    try {
      const res = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: matchId, side, amount }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Bet failed')
      setBets(prev => ({ ...prev, [matchId]: { ...optimisticBet, id: body.bet.id } }))
      setTokens(body.tokens)
    } catch (e: unknown) {
      setBets(prev => { const next = { ...prev }; delete next[matchId]; return next })
      setTokens(current)
      showToast(`⚠️ ${e instanceof Error ? e.message : 'Bet failed'}`)
    }
  }

  // ── Undo bet ──────────────────────────────────────────────────────────────────
  async function handleUndo(matchId: string) {
    const bet = bets[matchId]
    if (!bet) return

    const refunded = (tokens ?? 0) + bet.amount
    setBets(prev => { const next = { ...prev }; delete next[matchId]; return next })
    setTokens(refunded)
    showToast('Bet undone ↩️')

    try {
      const res = await fetch(`/api/bets?bet_id=${bet.id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Undo failed')
      setTokens(body.tokens)
    } catch (e: unknown) {
      setBets(prev => ({ ...prev, [matchId]: bet }))
      setTokens(t => (t ?? 0) - bet.amount)
      showToast(`⚠️ ${e instanceof Error ? e.message : 'Undo failed'}`)
    }
  }

  return (
    <>
      <Header tokens={tokens ?? 0} loading={loading} />

      <main style={{ padding: '14px 16px 88px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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

        {!loading && !error && matches.length === 0 && (
          <div style={{ textAlign:'center', padding:'48px 0', color:'#444', fontWeight:900, fontSize:'0.85rem', textTransform:'uppercase', letterSpacing:3 }}>
            No active matches right now.
          </div>
        )}

        {matches.map(match => (
          <Ring
            key={match.id}
            match={match}
            bet={bets[match.id] ?? null}
            onVote={side => handleVote(
              match.id, side,
              side === 'left' ? match.left_name : match.right_name,
              match.comp_type
            )}
            onUndo={() => handleUndo(match.id)}
          />
        ))}
      </main>

      <BetModal ctx={modalCtx} tokens={tokens ?? 0} onConfirm={handleConfirm} onClose={() => setModalCtx(null)} />
      <ComicFlash state={flash} />
      <Toast toast={toast} />

      <style>{`@keyframes spin { to{transform:rotate(360deg)} }`}</style>
    </>
  )
}
