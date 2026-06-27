"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const STORAGE_PREFIX = "admin-split-";
const MIN_PCT = 10;

type Panel = { key: string; node: ReactNode };

type Props = {
  panels: Panel[];
  /** Default divider positions (percentages). Only used when no localStorage value exists. */
  defaultPercents?: number[];
};

function readDividers(n: number, defaultPercents?: number[]): number[] {
  return Array.from({ length: n - 1 }, (_, i) => {
    const def  = defaultPercents?.[i] ?? ((i + 1) / n) * 100;
    if (typeof window === 'undefined') return def;
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

  const [dividers, setDividers] = useState<number[]>(() =>
    readDividers(n, defaultRef.current),
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const dragging     = useRef<number | null>(null);

  // Re-read when panel count changes
  useEffect(() => {
    setDividers(readDividers(n, defaultRef.current));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  function startDrag(e: React.PointerEvent, idx: number) {
    e.preventDefault();
    dragging.current = idx;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragging.current === null || !containerRef.current) return;
    const idx  = dragging.current;
    const rect = containerRef.current.getBoundingClientRect();
    const pct  = ((e.clientX - rect.left) / rect.width) * 100;

    setDividers(prev => {
      const next = [...prev];
      const lo   = idx === 0     ? MIN_PCT             : next[idx - 1] + MIN_PCT;
      const hi   = idx === n - 2 ? 100 - MIN_PCT       : next[idx + 1] - MIN_PCT;
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
