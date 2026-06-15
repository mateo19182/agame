"use client";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
}

export function playTone(freq: number, duration = 0.12, type: OscillatorType = "sine", gain = 0.18) {
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

export const sounds = {
  buzz: () => {
    playTone(880, 0.08, "square", 0.22);
    setTimeout(() => playTone(1320, 0.1, "square", 0.2), 60);
  },
  correct: () => {
    playTone(660, 0.1, "triangle");
    setTimeout(() => playTone(880, 0.12, "triangle"), 90);
    setTimeout(() => playTone(1100, 0.16, "triangle"), 200);
  },
  wrong: () => {
    playTone(220, 0.18, "sawtooth", 0.22);
    setTimeout(() => playTone(180, 0.2, "sawtooth", 0.2), 120);
  },
  tick: () => playTone(1200, 0.03, "sine", 0.08),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.18, "triangle", 0.22), i * 110));
  },
  reveal: () => playTone(440, 0.08, "sine", 0.12),
};
