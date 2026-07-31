'use client'
import { useEffect } from "react";

/**
 * Original synthesized cinematic sting — a low swelling drone plus three
 * ascending brass-like stabs timed to the page's fade-in beats (0.5s,
 * 2.2s, 3.9s). No licensed audio; Web Audio API only, generated on the fly.
 */
export default function DoomsdaySting() {
  useEffect(() => {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // Low swelling drone under the whole card.
    const drone = ctx.createOscillator();
    drone.type = "sawtooth";
    drone.frequency.value = 55; // A1
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.setValueAtTime(80, ctx.currentTime);
    droneFilter.frequency.linearRampToValueAtTime(500, ctx.currentTime + 6);
    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0, ctx.currentTime);
    droneGain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 1.5);
    droneGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 7.5);
    drone.connect(droneFilter).connect(droneGain).connect(master);
    drone.start();
    drone.stop(ctx.currentTime + 7.6);

    // Three ascending brass-ish stabs, one per text beat.
    const stabs: Array<[number, number]> = [[0.5, 130.8], [2.2, 164.8], [3.9, 220]]; // C3, E3, A3
    for (const [time, freq] of stabs) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + time;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.45, t0 + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.4);
      osc.connect(gain).connect(master);
      osc.start(t0);
      osc.stop(t0 + 1.5);
    }

    return () => {
      ctx.close().catch(() => {});
    };
  }, []);

  return null;
}
