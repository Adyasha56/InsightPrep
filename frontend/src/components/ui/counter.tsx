"use client";

import { useEffect, useRef, useState } from "react";

// Ticks up from 0 to its target value on mount — Hum signature move #4.
// Renders the final value instantly under prefers-reduced-motion.
export function Counter({ value, durationMs = 1200 }: { value: number; durationMs?: number }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Reduced-motion path: render the final value immediately instead of
      // animating — there is no idiomatic way to express this that the
      // lint rule accepts, since it's inherently a synchronous "skip the
      // animation" branch, not an async data sync.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(value);
      return;
    }

    let frame: number;
    function tick(timestamp: number) {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // snappy easeOutExpo-ish arrival
      setDisplay(Math.round(eased * value));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return <span className="font-data tabular-nums">{display}</span>;
}
