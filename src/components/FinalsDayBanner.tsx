/**
 * Gold "Finals Day" banner, shown on every public page (bid/voting, leaderboard,
 * bracket, match list) directly under that page's own title block while the
 * Finals Day setting is on — see getFinalsDay.
 *
 * Deliberately the one loud non-orange element on the site: solid gold with deep
 * blue text, rather than the translucent orange every other header uses, so it
 * reads as "today is different" at a glance. The blue is dark enough to clear
 * WCAG AA against the gold (contrast ≈ 8:1).
 *
 * Inline styles, not Tailwind, to match the surrounding public pages — they're
 * all styled this way.
 */
export default function FinalsDayBanner() {
  return (
    <div
      role="status"
      style={{
        marginTop: 10,
        padding: '7px 16px',
        borderRadius: 999,
        background: 'linear-gradient(135deg, #FFE477 0%, #FFD700 45%, #E8B400 100%)',
        border: '1px solid rgba(255,255,255,0.45)',
        boxShadow: '0 0 28px rgba(255,215,0,0.35)',
        textAlign: 'center',
        // Sits inside flex/grid headers as its own full-width row.
        alignSelf: 'stretch',
      }}
    >
      <span style={{
        fontSize: '0.78rem',
        fontWeight: 900,
        letterSpacing: 5,
        textTransform: 'uppercase',
        color: '#0B2E6F',
        // Bright gold behind heavy blue type can shimmer; a hairline light
        // shadow settles the edges without lifting the text off the plate.
        textShadow: '0 1px 0 rgba(255,255,255,0.35)',
        whiteSpace: 'nowrap',
      }}>
        Finals Day
      </span>
    </div>
  );
}
