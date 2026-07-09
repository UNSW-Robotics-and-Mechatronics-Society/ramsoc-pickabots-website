'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const CODE        = 'SUMO26'
const COOKIE_NAME = 'pickabots_access'

function hasCookie() {
  if (typeof document === 'undefined') return false
  return document.cookie.split('; ').some(c => c.startsWith(`${COOKIE_NAME}=1`))
}

function setCookie() {
  document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
}

export default function StandbyPage() {
  const [value,    setValue]    = useState('')
  const [shake,    setShake]    = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router   = useRouter()

  useEffect(() => {
    if (hasCookie()) { router.replace('/voting'); return }
    inputRef.current?.focus()
  }, [router])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (unlocked) return
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    setValue(raw)
    if (raw.length < 6) return

    if (raw === CODE) {
      setUnlocked(true)
      setCookie()
      setTimeout(() => router.replace('/voting'), 700)
    } else {
      setShake(true)
      setTimeout(() => { setValue(''); setShake(false) }, 650)
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '100dvh', padding: '24px 20px', gap: 36,
    }}>

      {/* Branding */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-audiowide)', fontSize: '1.9rem',
          color: '#FF6B00', letterSpacing: 6, textTransform: 'uppercase',
          textShadow: '0 0 32px rgba(255,107,0,0.45)',
        }}>
          PICKABOTS
        </div>
        <div style={{
          display: 'inline-block', marginTop: 8,
          padding: '4px 12px', borderRadius: 6,
          background: 'rgba(255,107,0,0.3)',
        }}>
          <span style={{
            fontSize: '0.48rem', fontWeight: 900, letterSpacing: 6,
            color: '#fff', textTransform: 'uppercase',
          }}>
            AWAITING ACCESS CODE
          </span>
        </div>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 340,
        background: 'rgba(4,2,12,0.72)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${unlocked ? 'rgba(76,255,0,0.35)' : shake ? 'rgba(255,45,45,0.35)' : 'rgba(255,107,0,0.18)'}`,
        borderRadius: 18, padding: '28px 24px',
        boxShadow: unlocked ? '0 0 48px rgba(76,255,0,0.1)' : '0 0 48px rgba(255,85,0,0.07)',
        transition: 'border-color 0.25s, box-shadow 0.25s',
      }}>
        <div style={{
          fontSize: '0.44rem', fontWeight: 900, letterSpacing: 5,
          color: unlocked ? '#4cff00' : '#fff',
          textTransform: 'uppercase', textAlign: 'center', marginBottom: 22,
          transition: 'color 0.25s',
        }}>
          {unlocked ? '✓  ACCESS GRANTED' : 'ENTER 6-CHARACTER CODE'}
        </div>

        {/* Hidden input + 6-box display */}
        <div
          style={{ position: 'relative', cursor: 'text' }}
          onClick={() => inputRef.current?.focus()}
        >
          <input
            ref={inputRef}
            value={value}
            onChange={handleChange}
            maxLength={6}
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              opacity: 0, cursor: 'text', fontSize: 1,
            }}
          />
          <div style={{
            display: 'flex', gap: 8, justifyContent: 'center',
            animation: shake ? 'shake 0.55s ease' : 'none',
          }}>
            {Array.from({ length: 6 }, (_, i) => {
              const char   = value[i] ?? ''
              const active = i === value.length && !unlocked && !shake
              const filled = !!char
              return (
                <div key={i} style={{
                  width: 42, height: 54,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: filled ? 'rgba(255,107,0,0.07)' : 'rgba(255,255,255,0.025)',
                  border: `1.5px solid ${
                    unlocked ? 'rgba(76,255,0,0.45)'
                    : shake   ? 'rgba(255,45,45,0.55)'
                    : active  ? 'rgba(255,107,0,0.75)'
                    : filled  ? 'rgba(255,107,0,0.3)'
                    : 'rgba(255,255,255,0.07)'
                  }`,
                  borderRadius: 10,
                  fontFamily: 'var(--font-audiowide)',
                  fontSize: '1.3rem', fontWeight: 400,
                  color: unlocked ? '#4cff00' : shake ? '#ff4444' : '#FF6B00',
                  textShadow: unlocked
                    ? '0 0 14px rgba(76,255,0,0.6)'
                    : filled ? '0 0 14px rgba(255,107,0,0.5)' : 'none',
                  transition: 'border-color 0.15s, color 0.15s',
                  boxShadow: active ? '0 0 0 1px rgba(255,107,0,0.25)' : 'none',
                }}>
                  {char || (active
                    ? <span style={{ width: 2, height: 22, background: '#FF6B00', borderRadius: 1, animation: 'blink 1s step-end infinite' }} />
                    : null
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {shake && (
          <div style={{
            marginTop: 16, textAlign: 'center',
            fontSize: '0.44rem', fontWeight: 900, letterSpacing: 4,
            color: '#ff4444', textTransform: 'uppercase',
          }}>
            INVALID CODE
          </div>
        )}
      </div>

      <div style={{
        display: 'inline-block', padding: '4px 12px', borderRadius: 6,
        background: 'rgba(255,107,0,0.3)',
      }}>
        <span style={{
          fontSize: '0.4rem', color: '#fff', fontWeight: 900,
          textTransform: 'uppercase', letterSpacing: 4, textAlign: 'center',
        }}>
          RAMSoc · UNSW · Pickabots 2026
        </span>
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform:translateX(0) }
          15%      { transform:translateX(-7px) }
          30%      { transform:translateX(7px) }
          45%      { transform:translateX(-5px) }
          60%      { transform:translateX(5px) }
          75%      { transform:translateX(-3px) }
          90%      { transform:translateX(3px) }
        }
        @keyframes blink {
          0%,100% { opacity:1 } 50% { opacity:0 }
        }
      `}</style>
    </div>
  )
}
