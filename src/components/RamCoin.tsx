'use client'
import { useId } from 'react'
import type { CSSProperties } from 'react'

// Gold coin with a ram head on it — used wherever the currency icon appears.
// Unique gradient IDs per instance avoid SVG defs conflicts when multiple
// coins are rendered on the same page.
export default function RamCoin({ size = 20, style }: { size?: number; style?: CSSProperties }) {
  const uid = useId().replace(/:/g, 'x')
  const cf  = `cf${uid}` // coin face gradient id
  const cr  = `cr${uid}` // coin rim  gradient id

  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle', ...style }}
      aria-hidden
    >
      <defs>
        {/* Face: bright gold at centre, deep amber at edge */}
        <radialGradient id={cf} cx="38%" cy="30%" r="70%">
          <stop offset="0%"   stopColor="#FFF8C0"/>
          <stop offset="40%"  stopColor="#FFD700"/>
          <stop offset="100%" stopColor="#9A6700"/>
        </radialGradient>
        {/* Rim: darker amber */}
        <radialGradient id={cr} cx="35%" cy="28%" r="75%">
          <stop offset="0%"   stopColor="#C8941A"/>
          <stop offset="100%" stopColor="#5A3C00"/>
        </radialGradient>
      </defs>

      {/* Outer rim */}
      <circle cx="16" cy="16" r="15.5" fill={`url(#${cr})`}/>
      {/* Face */}
      <circle cx="16" cy="16" r="13.5" fill={`url(#${cf})`}/>
      {/* Top-left glint */}
      <ellipse cx="10.5" cy="9" rx="5" ry="3" fill="rgba(255,255,255,0.18)" pointerEvents="none"/>

      {/* Left horn: rises up-left then curls back down */}
      <path d="M 12.5,18 C 7,9.5, 2.5,13, 7.5,21"
            fill="none" stroke="#6B3A00" strokeWidth="3.2" strokeLinecap="round"/>
      {/* Right horn: mirrored */}
      <path d="M 19.5,18 C 25,9.5, 29.5,13, 24.5,21"
            fill="none" stroke="#6B3A00" strokeWidth="3.2" strokeLinecap="round"/>

      {/* Head body */}
      <ellipse cx="16" cy="21" rx="3.8" ry="3.3" fill="#6B3A00"/>
      {/* Eyes */}
      <circle cx="14.3" cy="20" r="1" fill="#FFF8C0"/>
      <circle cx="17.7" cy="20" r="1" fill="#FFF8C0"/>
      {/* Snout */}
      <ellipse cx="16" cy="23" rx="2.2" ry="1.4" fill="#4A2600"/>
    </svg>
  )
}
