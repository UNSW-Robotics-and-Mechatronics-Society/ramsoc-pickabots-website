type BotShape = 'wedge' | 'spinner' | 'drum' | 'flipper' | 'lifter' | 'fullbody' | 'bossbot'

export default function BotSvg({ shape, color }: { shape: string; color: string }) {
  const c = color
  const d = '#111'

  const bodies: Record<string, React.ReactNode> = {
    wedge: (<>
      <rect x="10" y="30" width="44" height="26" rx="4" fill={c}/>
      <rect x="16" y="20" width="12" height="14" rx="3" fill={d}/>
      <rect x="36" y="20" width="12" height="14" rx="3" fill={d}/>
      <circle cx="22" cy="27" r="4" fill={c}/><circle cx="42" cy="27" r="4" fill={c}/>
      <rect x="8"  y="52" width="8" height="8" rx="2" fill="#555"/>
      <rect x="48" y="52" width="8" height="8" rx="2" fill="#555"/>
    </>),
    spinner: (<>
      <rect x="14" y="28" width="36" height="24" rx="6" fill={c}/>
      <rect x="6"  y="38" width="52" height="6"  rx="3" fill={c} opacity="0.9"/>
      <circle cx="32" cy="40" r="8" fill={d} stroke={c} strokeWidth="2"/>
      <circle cx="32" cy="40" r="3" fill={c}/>
      <rect x="20" y="20" width="8" height="10" rx="2" fill={d}/>
      <rect x="36" y="20" width="8" height="10" rx="2" fill={d}/>
      <circle cx="24" cy="25" r="3" fill={c}/><circle cx="40" cy="25" r="3" fill={c}/>
      <rect x="10" y="52" width="8" height="8" rx="2" fill="#555"/>
      <rect x="46" y="52" width="8" height="8" rx="2" fill="#555"/>
    </>),
    drum: (<>
      <rect x="14" y="24" width="36" height="30" rx="5" fill={c}/>
      <ellipse cx="32" cy="24" rx="18" ry="8" fill={c} opacity="0.9"/>
      <rect x="22" y="14" width="8" height="12" rx="3" fill={d}/>
      <rect x="34" y="14" width="8" height="12" rx="3" fill={d}/>
      <circle cx="26" cy="20" r="3" fill={c}/><circle cx="38" cy="20" r="3" fill={c}/>
      <rect x="10" y="52" width="8" height="8" rx="2" fill="#555"/>
      <rect x="46" y="52" width="8" height="8" rx="2" fill="#555"/>
    </>),
    flipper: (<>
      <rect x="16" y="30" width="32" height="22" rx="4" fill={c}/>
      <path d="M10 52 Q32 20 54 52" stroke={c} strokeWidth="6" fill="none" strokeLinecap="round"/>
      <rect x="20" y="20" width="8" height="12" rx="3" fill={d}/>
      <rect x="36" y="20" width="8" height="12" rx="3" fill={d}/>
      <circle cx="24" cy="26" r="3" fill={c}/><circle cx="40" cy="26" r="3" fill={c}/>
      <rect x="10" y="52" width="8" height="8" rx="2" fill="#555"/>
      <rect x="46" y="52" width="8" height="8" rx="2" fill="#555"/>
    </>),
    lifter: (<>
      <rect x="14" y="32" width="36" height="22" rx="4" fill={c}/>
      <path d="M10 48 L22 30 L42 30 L54 48" stroke={c} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="20" y="20" width="8" height="12" rx="3" fill={d}/>
      <rect x="36" y="20" width="8" height="12" rx="3" fill={d}/>
      <circle cx="24" cy="26" r="3" fill={c}/><circle cx="40" cy="26" r="3" fill={c}/>
      <rect x="10" y="52" width="8" height="8" rx="2" fill="#555"/>
      <rect x="46" y="52" width="8" height="8" rx="2" fill="#555"/>
    </>),
    fullbody: (<>
      <rect x="10" y="22" width="44" height="34" rx="6" fill={c}/>
      <rect x="18" y="14" width="28" height="12" rx="4" fill={c} opacity="0.8"/>
      <rect x="20" y="16" width="8" height="8" rx="2" fill={d}/>
      <rect x="36" y="16" width="8" height="8" rx="2" fill={d}/>
      <circle cx="24" cy="20" r="3" fill={c} opacity="0.6"/>
      <circle cx="40" cy="20" r="3" fill={c} opacity="0.6"/>
      <rect x="8"  y="52" width="10" height="8" rx="2" fill="#555"/>
      <rect x="46" y="52" width="10" height="8" rx="2" fill="#555"/>
    </>),
    bossbot: (<>
      <rect x="8"  y="18" width="48" height="38" rx="6" fill="#1a001a"/>
      <rect x="8"  y="18" width="48" height="38" rx="6" stroke="#9B30FF" strokeWidth="2" fill="none"/>
      <rect x="16" y="8"  width="32" height="14" rx="4" fill="#110011" stroke="#9B30FF" strokeWidth="1.5"/>
      <rect x="20" y="10" width="10" height="8"  rx="2" fill="#9B30FF" opacity="0.9"/>
      <rect x="34" y="10" width="10" height="8"  rx="2" fill="#9B30FF" opacity="0.9"/>
      <circle cx="25" cy="14" r="4" fill="#cc66ff"/>
      <circle cx="39" cy="14" r="4" fill="#cc66ff"/>
      <circle cx="25" cy="14" r="2" fill="#fff"/>
      <circle cx="39" cy="14" r="2" fill="#fff"/>
      <rect x="16" y="32" width="32" height="4" rx="2" fill="#9B30FF" opacity="0.6"/>
      <rect x="16" y="40" width="32" height="4" rx="2" fill="#9B30FF" opacity="0.4"/>
      <path d="M6 44 L14 30 L14 56 Z" fill="#330033" stroke="#9B30FF" strokeWidth="1"/>
      <path d="M58 44 L50 30 L50 56 Z" fill="#330033" stroke="#9B30FF" strokeWidth="1"/>
      <rect x="6"  y="54" width="12" height="8" rx="2" fill="#333"/>
      <rect x="46" y="54" width="12" height="8" rx="2" fill="#333"/>
    </>),
  }

  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
      {bodies[shape] ?? bodies.wedge}
      <ellipse cx="32" cy="62" rx="20" ry="3" fill="#00000088"/>
    </svg>
  )
}
