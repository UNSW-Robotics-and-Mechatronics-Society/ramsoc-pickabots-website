"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Bump the "v2" suffix whenever the intended default layout changes, so a
// divider position saved during earlier testing doesn't silently override it.
const STORAGE_PREFIX = "admin-split-v2-";
const MIN_PCT = 10;

type Panel = { key: string; node: ReactNode; minPx?: number };

type Props = {
  panels: Panel[];
  /** Default divider positions (percentages). Only used when no localStorage value exists. */
  defaultPercents?: number[];
};

function defaultDividers(n: number, defaultPercents?: number[]): number[] {
  return Array.from({ length: n - 1 }, (_, i) => defaultPercents?.[i] ?? ((i + 1) / n) * 100);
}

/** Client-only — call from an effect, never from the initial render (see below). */
function readDividers(n: number, defaultPercents?: number[]): number[] {
  return Array.from({ length: n - 1 }, (_, i) => {
    const def = defaultPercents?.[i] ?? ((i + 1) / n) * 100;
    const saved = localStorage.getItem(`${STORAGE_PREFIX}${i}`);
    if (!saved) return def;
    const v = parseFloat(saved);
    return isFinite(v) ? v : def;
  });
}

export default function MultiPanelSplit({ panels, defaultPercents }: Props) {
  const n = panels.length;

  // Capture initial defaultPercents in a ref so the effect doesn't re-run on prop changes
  const defaultRef = useRef(defaultPercents);

  // Always starts from the plain defaults (never localStorage) so the first
  // client render matches the server-rendered HTML exactly — otherwise this
  // is a hydration mismatch, since the server can't read localStorage.
  // Restoring the saved split happens right after, in the effect below.
  // Reads the `defaultPercents` prop directly rather than defaultRef — refs
  // can't be read during render, only in effects/handlers.
  const [dividers, setDividers] = useState<number[]>(() =>
    defaultDividers(n, defaultPercents),
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const dragging     = useRef<number | null>(null);

  // Restore from localStorage on mount, and re-read when panel count changes.
  useEffect(() => {
    setDividers(readDividers(n, defaultRef.current));
  }, [n]);

  function startDrag(e: React.PointerEvent, idx: number) {
    e.preventDefault();
    dragging.current = idx;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  // A panel's own minPx (e.g. "always show at least one full ring column")
  // takes priority over the generic MIN_PCT floor.
  function minPctFor(panelIdx: number, containerWidthPx: number): number {
    const minPx = panels[panelIdx]?.minPx;
    if (!minPx || containerWidthPx <= 0) return MIN_PCT;
    return Math.max(MIN_PCT, (minPx / containerWidthPx) * 100);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragging.current === null || !containerRef.current) return;
    const idx  = dragging.current;
    const rect = containerRef.current.getBoundingClientRect();
    const pct  = ((e.clientX - rect.left) / rect.width) * 100;

    setDividers(prev => {
      const next = [...prev];
      // Divider `idx` is the shared boundary between panel[idx] (left) and
      // panel[idx + 1] (right) — clamp so neither shrinks past its own minPx.
      const lo = (idx === 0     ? 0   : next[idx - 1]) + minPctFor(idx,     rect.width);
      const hi = (idx === n - 2 ? 100 : next[idx + 1]) - minPctFor(idx + 1, rect.width);
      next[idx]  = Math.max(lo, Math.min(hi, pct));
      localStorage.setItem(`${STORAGE_PREFIX}${idx}`, String(next[idx]));
      return next;
    });
  }

  function stopDrag() { dragging.current = null; }

  const widths = panels.map((_, i) => {
    const left  = i === 0     ? 0   : dividers[i - 1];
    const right = i === n - 1 ? 100 : dividers[i];
    return right - left;
  });

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full overflow-hidden"
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      {panels.map((panel, i) => (
        <div key={panel.key} className="flex h-full shrink-0 overflow-hidden" style={{ width: `${widths[i]}%` }}>
          <div className="min-w-0 flex-1 overflow-hidden">
            {panel.node}
          </div>
          {i < n - 1 && (
            <div
              onPointerDown={e => startDrag(e, i)}
              className="relative z-10 w-1 shrink-0 cursor-col-resize bg-white/10 transition-colors hover:bg-white/25 active:bg-white/40"
              aria-hidden
            />
          )}
        </div>
      ))}
    </div>
  );
}
