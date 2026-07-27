'use client'

import { useEffect, useState } from 'react'
import { Radio, Circle, Camera, RotateCcw, Wifi, WifiOff, MonitorX } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import { type ObsAction, type ObsState, SCREEN_SCENES, relayIsFresh, ringSceneName } from '@/lib/obs'
import { MAX_RINGS } from '@/lib/schedule'
import type { Division } from '@/lib/mock-data'

export type RingInfo = { ring: number; active: string | null; next: string | null }

type Props = {
  initialState: ObsState
  live: Record<Division, RingInfo[]>
}

/**
 * One-handed phone control surface for the stream. Every button is a
 * fire-and-forget POST that queues a command for the relay agent — feedback
 * comes back asynchronously through pickabots_obs_state (the relay reports
 * OBS's actual scene/stream state), which useRealtimeRefresh re-renders us
 * with. So a tap highlights nothing by itself: the highlight moves when OBS
 * really switched. Over flaky cellular that's the honest behaviour — the
 * panel never claims a state it hasn't seen confirmed.
 */
export default function ControlPanel({ initialState, live }: Props) {
  useRealtimeRefresh(['pickabots_obs_state', 'bracket_matches', 'bracket_schedule'], { intervalMs: 1500 })
  const s = initialState

  // relayIsFresh compares against wall-clock "now" — re-evaluate every few
  // seconds so a silent relay flips the light to red without needing a page
  // event (there is no realtime row-change when the relay just... stops).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])
  const relayUp = relayIsFresh(s, now)
  // A failed command (bad scene name, OBS closed mid-tap) is written to the
  // state row by the relay; show it while fresh so the operator's phone — not
  // just the venue console — knows the tap didn't land.
  const staleError = !s.lastErrorAt || now - new Date(s.lastErrorAt).getTime() > 60_000
  const stats = s.streamStats
  // Live-health verdict: the flag says the output is on; the measured bitrate
  // says data is really leaving. A live stream pushing ~0 kbps is stalled.
  const stalled = s.streaming && stats.kbps !== undefined && stats.kbps < 100

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Stop-stream/record are destructive mid-event; require a second tap
  // within 4s instead of a confirm dialog (dialogs are easy to fat-finger
  // through one-handed, and block the whole panel).
  const [armed, setArmed] = useState<string | null>(null)
  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(null), 4000)
    return () => clearTimeout(id)
  }, [armed])

  async function send(action: ObsAction, payload: Record<string, unknown> = {}, key = action as string) {
    setBusy(key); setError(null)
    try {
      const res = await fetch('/api/admin/obs/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      })
      if (!res.ok) setError((await res.json().catch(() => null))?.error ?? `Command failed (${res.status})`)
    } catch {
      setError('Network error — command not sent')
    } finally {
      setBusy(null)
    }
  }

  function armedSend(key: string, action: ObsAction) {
    if (armed !== key) { setArmed(key); return }
    setArmed(null)
    void send(action, {}, key)
  }

  // ── Now Battling override form ─────────────────────────────────────────
  const [left, setLeft] = useState(s.overrideLeft)
  const [right, setRight] = useState(s.overrideRight)
  const [ring, setRing] = useState(s.overrideRing)

  async function postOverride(active: boolean) {
    setBusy('override'); setError(null)
    try {
      const res = await fetch('/api/admin/obs/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active, ring, left, right }),
      })
      if (!res.ok) setError((await res.json().catch(() => null))?.error ?? `Override failed (${res.status})`)
    } catch {
      setError('Network error — override not sent')
    } finally {
      setBusy(null)
    }
  }

  const bigBtn = 'flex min-h-16 items-center justify-center gap-2 rounded-2xl border text-sm font-bold uppercase tracking-wider transition-colors active:scale-[0.98]'

  return (
    <div className="flex flex-col gap-4 pb-8">
      <header className="flex items-center justify-between pt-1">
        <h1 className="text-lg tracking-widest">Stream Control</h1>
        <div className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-wider">
          {relayUp
            ? <span className="flex items-center gap-1 text-emerald-400"><Wifi size={14}/>Relay</span>
            : <span className="flex items-center gap-1 text-red-400"><WifiOff size={14}/>Relay</span>}
          {relayUp && !s.obsConnected &&
            <span className="flex items-center gap-1 text-amber-400"><MonitorX size={14}/>OBS</span>}
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {!relayUp && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Relay agent offline — buttons will queue but nothing reaches OBS until it reconnects.
        </div>
      )}
      {!staleError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          Command failed: {s.lastError}
        </div>
      )}
      {stalled && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300">
          Stream reads LIVE but is pushing ~{stats.kbps} kbps — the output may be stalled. Check the
          venue internet and the platform dashboard.
        </div>
      )}

      {/* ── Scenes ─────────────────────────────────────────── */}
      <section className="glass rounded-2xl p-3">
        <h2 className="mb-2 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-foreground/60">Scene</h2>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: MAX_RINGS }, (_, i) => ringSceneName(i + 1)).map(scene => (
            <button
              key={scene}
              onClick={() => send('set_scene', { scene }, `scene:${scene}`)}
              disabled={busy === `scene:${scene}`}
              className={cn(bigBtn,
                s.currentScene === scene
                  ? 'border-orange-400/70 bg-orange-500/25 text-orange-200'
                  : 'border-white/15 bg-white/5 text-foreground/80 hover:bg-white/10')}
            >
              {scene}
            </button>
          ))}
        </div>
        <h2 className="mb-2 mt-3 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-foreground/60">Screens</h2>
        <div className="grid grid-cols-2 gap-2">
          {SCREEN_SCENES.map(scene => (
            <button
              key={scene}
              onClick={() => send('set_scene', { scene }, `scene:${scene}`)}
              disabled={busy === `scene:${scene}`}
              className={cn(bigBtn,
                s.currentScene === scene
                  ? 'border-orange-400/70 bg-orange-500/25 text-orange-200'
                  : 'border-white/15 bg-white/5 text-foreground/80 hover:bg-white/10')}
            >
              {scene}
            </button>
          ))}
        </div>
      </section>

      {/* ── Stream / record / replay ───────────────────────── */}
      <section className="glass rounded-2xl p-3">
        <h2 className="mb-2 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-foreground/60">Output</h2>
        <div className="grid grid-cols-2 gap-2">
          {s.streaming ? (
            <button onClick={() => armedSend('stop_stream', 'stop_stream')}
              className={cn(bigBtn, armed === 'stop_stream'
                ? 'border-red-400 bg-red-500/40 text-red-100'
                : 'border-red-500/50 bg-red-500/15 text-red-300')}>
              <Radio size={16}/>{armed === 'stop_stream' ? 'Tap to confirm' : 'Stop Stream'}
            </button>
          ) : (
            <button onClick={() => send('start_stream')}
              className={cn(bigBtn, 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300')}>
              <Radio size={16}/>Go Live
            </button>
          )}
          {s.recording ? (
            <button onClick={() => armedSend('stop_record', 'stop_record')}
              className={cn(bigBtn, armed === 'stop_record'
                ? 'border-red-400 bg-red-500/40 text-red-100'
                : 'border-red-500/50 bg-red-500/15 text-red-300')}>
              <Circle size={16}/>{armed === 'stop_record' ? 'Tap to confirm' : 'Stop Rec'}
            </button>
          ) : (
            <button onClick={() => send('start_record')}
              className={cn(bigBtn, 'border-white/15 bg-white/5 text-foreground/80')}>
              <Circle size={16}/>Record
            </button>
          )}
          {s.replayBuffer ? (
            <button onClick={() => send('save_replay_buffer')}
              className={cn(bigBtn, 'col-span-2 border-sky-500/50 bg-sky-500/15 text-sky-300')}>
              <RotateCcw size={16}/>Save Instant Replay
            </button>
          ) : (
            <button onClick={() => send('start_replay_buffer')}
              className={cn(bigBtn, 'col-span-2 border-white/15 bg-white/5 text-foreground/70')}>
              <Camera size={16}/>Start Replay Buffer
            </button>
          )}
        </div>
        {/* Confirmed output health, not what was last requested: while live,
            timecode/bitrate/drops are measured by the relay each heartbeat. */}
        {s.streaming ? (
          <p className="mt-2 text-[0.65rem] font-bold leading-relaxed">
            <span className={stalled ? 'text-red-400' : 'text-emerald-400'}>● LIVE</span>
            {stats.timecode && <span className="text-foreground/70"> · {stats.timecode}</span>}
            {stats.kbps !== undefined && (
              <span className={stalled ? 'text-red-400' : 'text-foreground/70'}> · {stats.kbps.toLocaleString()} kbps</span>
            )}
            {stats.droppedPct !== undefined && (
              <span className={stats.droppedPct > 5 ? 'text-amber-400' : 'text-foreground/70'}>
                {' '}· {stats.droppedPct}% dropped
              </span>
            )}
          </p>
        ) : (
          <p className="mt-2 text-[0.6rem] leading-relaxed text-foreground/50">Not streaming</p>
        )}
        <p className="mt-1 text-[0.6rem] leading-relaxed text-foreground/50">
          {s.recording ? 'Recording' : 'Not recording'} · Replay buffer {s.replayBuffer ? 'armed' : 'off'}
        </p>
      </section>

      {/* ── Remote room feeds (MediaMTX ingest health) ─────── */}
      {Object.keys(s.feedStatus).length > 0 && (
        <section className="glass rounded-2xl p-3">
          <h2 className="mb-2 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-foreground/60">
            Remote feeds
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(s.feedStatus).map(([name, live]) => (
              <div key={name} className={cn(
                'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl border text-[0.65rem] font-bold uppercase tracking-wider',
                live
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/40 bg-red-500/10 text-red-300',
              )}>
                <span>{name}</span>
                <span className="text-[0.5rem] opacity-80">{live ? 'receiving' : 'offline'}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[0.6rem] leading-relaxed text-foreground/50">
            RTMP feeds arriving at the main PC from the other rooms, checked every heartbeat.
          </p>
        </section>
      )}

      {/* ── Now Battling override ──────────────────────────── */}
      <section className="glass rounded-2xl p-3">
        <h2 className="mb-2 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-foreground/60">
          Now Battling override
        </h2>
        <p className="mb-2 text-[0.6rem] leading-relaxed text-foreground/50">
          Overlays normally derive the current match from the bracket. Use this only when the
          lower-third should say something else (exhibition bout, walk-on, tech delay).
        </p>
        <div className="flex flex-col gap-2">
          <input value={left} onChange={e => setLeft(e.target.value)} placeholder="Bot A"
            className="min-h-12 rounded-xl border border-white/15 bg-white/5 px-3 text-sm outline-none placeholder:text-foreground/30 focus:border-white/40" />
          <input value={right} onChange={e => setRight(e.target.value)} placeholder="Bot B"
            className="min-h-12 rounded-xl border border-white/15 bg-white/5 px-3 text-sm outline-none placeholder:text-foreground/30 focus:border-white/40" />
          <select value={ring} onChange={e => setRing(Number(e.target.value))}
            className="min-h-12 rounded-xl border border-white/15 bg-white/5 px-3 text-sm outline-none [&>option]:bg-neutral-900">
            <option value={0}>All rings</option>
            {Array.from({ length: MAX_RINGS }, (_, i) => (
              <option key={i + 1} value={i + 1}>Ring {i + 1} only</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => postOverride(true)} disabled={busy === 'override' || (!left.trim() && !right.trim())}
              className={cn(bigBtn, 'border-orange-400/60 bg-orange-500/20 text-orange-200 disabled:opacity-40')}>
              Set
            </button>
            <button onClick={() => postOverride(false)} disabled={busy === 'override'}
              className={cn(bigBtn, 'border-white/15 bg-white/5 text-foreground/70 disabled:opacity-40')}>
              Clear
            </button>
          </div>
          {s.overrideActive && (
            <p className="text-[0.65rem] font-bold text-orange-300">
              Override LIVE: {s.overrideLeft || 'TBD'} vs {s.overrideRight || 'TBD'}
              {s.overrideRing > 0 ? ` (Ring ${s.overrideRing})` : ' (all rings)'}
            </p>
          )}
        </div>
      </section>

      {/* ── What the bracket says is on each ring ──────────── */}
      {(['standards', 'open'] as Division[]).map(d => (
        <section key={d} className="glass rounded-2xl p-3">
          <h2 className="mb-2 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-foreground/60">
            {d === 'standards' ? 'Standard' : 'Open'} rings (from bracket)
          </h2>
          <ul className="flex flex-col gap-1 text-xs">
            {live[d].length === 0 && <li className="text-foreground/40">No rings scheduled</li>}
            {live[d].map(r => (
              <li key={r.ring} className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 font-bold text-foreground/50">R{r.ring}</span>
                <span className="min-w-0 flex-1 truncate">
                  {r.active ?? <span className="text-foreground/35">idle</span>}
                  {r.next && <span className="text-foreground/45"> → {r.next}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
