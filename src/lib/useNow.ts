"use client";

import { useEffect, useState } from "react";

export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function formatRemaining(targetMs: number, now: number): string {
  const diff = Math.max(0, targetMs - now);
  const s = Math.ceil(diff / 1000);
  return `${s}`;
}
