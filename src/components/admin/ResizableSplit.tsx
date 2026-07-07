"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const STORAGE_KEY = "admin-split-ratio";
const MIN_PCT = 20;
const MAX_PCT = 80;

type Props = {
  left: ReactNode;
  right: ReactNode;
};

export default function ResizableSplit({ left, right }: Props) {
  const [leftPct, setLeftPct] = useState<number>(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Restore saved ratio on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const n = parseFloat(saved);
      if (n >= MIN_PCT && n <= MAX_PCT) setLeftPct(n);
    }
  }, []);

  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    isDragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const raw = ((e.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.min(MAX_PCT, Math.max(MIN_PCT, raw));
    setLeftPct(clamped);
    localStorage.setItem(STORAGE_KEY, String(clamped));
  }

  function stopDrag() {
    isDragging.current = false;
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full overflow-hidden"
    >
      {/* Left panel */}
      <div
        style={{ width: `${leftPct}%` }}
        className="h-full min-w-0 overflow-hidden"
      >
        {left}
      </div>

      {/* Drag handle */}
      <div
        onPointerDown={startDrag}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        className="relative z-10 w-1 shrink-0 cursor-col-resize bg-white/10 transition-colors hover:bg-white/25 active:bg-white/40"
        aria-hidden
      />

      {/* Right panel */}
      <div
        style={{ width: `${100 - leftPct}%` }}
        className="h-full min-w-0 overflow-hidden"
      >
        {right}
      </div>
    </div>
  );
}
