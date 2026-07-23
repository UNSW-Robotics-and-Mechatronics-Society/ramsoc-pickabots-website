'use client'
import AdminUserButton from './AdminUserButton'
import RamCoin from './RamCoin'

export default function Header({ tokens, loading }: { tokens: number; loading: boolean }) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(3,1,8,0.78)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(255,100,0,0.35)',
      padding: '10px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      boxShadow: '0 4px 32px rgba(255,85,0,0.12)',
    }}>
      {/* Logo */}
      <div>
        <div style={{
          fontSize: '1.35rem', fontWeight: 900, lineHeight: 1,
          color: '#FF6B00', letterSpacing: 5,
          textShadow: '0 0 18px rgba(255,107,0,0.7), 0 0 40px rgba(255,60,0,0.3)',
          textTransform: 'uppercase',
        }}>
          PICKA<span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>BOTS
        </div>
        <div style={{
          fontSize: '0.38rem', letterSpacing: 7, color: 'rgba(255,107,0,0.45)',
          textTransform: 'uppercase', marginTop: 3, fontWeight: 900,
        }}>
          ◆ COMBAT ARENA ◆
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Token display */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'rgba(255,107,0,0.08)',
          border: '1px solid rgba(255,180,0,0.3)',
          borderRadius: 999, padding: '5px 14px',
          boxShadow: '0 0 14px rgba(255,180,0,0.12)',
          backdropFilter: 'blur(8px)',
        }}>
          <span style={{ display: 'inline-block', animation: 'orbitSpin 6s linear infinite' }}>
            <RamCoin size={22} />
          </span>
          <span style={{
            fontSize: '1.1rem', fontWeight: 900, color: '#FFD700', letterSpacing: 2,
            textShadow: '0 0 10px rgba(255,215,0,0.5)', minWidth: 32, textAlign: 'center',
            opacity: loading ? 0.4 : 1, transition: 'opacity 0.3s',
          }}>
            {loading ? '—' : tokens}
          </span>
          <span style={{ fontSize: '0.5rem', color: '#666', fontWeight: 900, letterSpacing: 2 }}>RC</span>
        </div>

        <AdminUserButton />
      </div>

      <style>{`
        @keyframes orbitSpin {
          0%   { transform: rotateY(0deg) scale(1); }
          50%  { transform: rotateY(180deg) scale(0.85); }
          100% { transform: rotateY(360deg) scale(1); }
        }
      `}</style>
    </header>
  )
}
