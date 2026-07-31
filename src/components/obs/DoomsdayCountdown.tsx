'use client'
import { useEffect, useState } from "react";
import { GOLD, FONT_DISPLAY } from "./overlayTheme";

// Avengers: Doomsday's confirmed theatrical release.
const TARGET = new Date("2026-12-18T00:00:00");

function timeLeft() {
  const ms = Math.max(0, TARGET.getTime() - Date.now());
  const totalSeconds = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/** Live countdown to Avengers: Doomsday's release — ticks every second. */
export default function DoomsdayCountdown() {
  const [t, setT] = useState<ReturnType<typeof timeLeft> | null>(null);

  useEffect(() => {
    setT(timeLeft());
    const id = setInterval(() => setT(timeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!t) return null;

  const units: Array<[string, number]> = [
    ["Days", t.days], ["Hours", t.hours], ["Min", t.minutes], ["Sec", t.seconds],
  ];

  return (
    <div style={{ display: "flex", gap: "1.5vw" }}>
      {units.map(([label, value]) => (
        <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span style={{
            fontFamily: FONT_DISPLAY, fontSize: "2vw", color: GOLD,
            fontVariantNumeric: "tabular-nums",
            textShadow: "0 0 20px rgba(255,215,0,0.35)",
          }}>
            {String(value).padStart(2, "0")}
          </span>
          <span style={{
            fontSize: "0.6vw", letterSpacing: "0.3em",
            color: "rgba(244,247,251,0.6)", textTransform: "uppercase",
          }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
