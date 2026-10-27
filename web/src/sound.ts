/**
 * Tiny synthesized sound effects (Web Audio, no files). Muting is remembered per device.
 */
export type Cue = "start" | "tap" | "right" | "wrong" | "reveal" | "perfect";

const KEY = "ofd.sound";
let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}

export function setSoundOn(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode */ }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** One note: frequency in Hz, start offset and length in seconds. */
function note(ac: AudioContext, freq: number, at: number, len: number, type: OscillatorType = "sine", gain = 0.16) {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + len + 0.02);
}

const CUES: Record<Cue, (ac: AudioContext) => void> = {
  start: (ac) => [523.25, 659.25, 783.99].forEach((f, i) => note(ac, f, i * 0.07, 0.22, "triangle")),
  tap: (ac) => note(ac, 880, 0, 0.06, "sine", 0.06),
  right: (ac) => { note(ac, 659.25, 0, 0.14, "triangle"); note(ac, 987.77, 0.09, 0.26, "triangle"); },
  wrong: (ac) => { note(ac, 220, 0, 0.16, "sawtooth", 0.07); note(ac, 174.61, 0.12, 0.26, "sawtooth", 0.07); },
  reveal: (ac) => [392, 523.25, 659.25, 783.99].forEach((f, i) => note(ac, f, i * 0.11, 0.35, "triangle", 0.13)),
  perfect: (ac) => [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => note(ac, f, i * 0.09, 0.45, "triangle", 0.13)),
};

export function play(cue: Cue): void {
  if (!soundOn()) return;
  const ac = audio();
  if (ac) CUES[cue](ac);
}

/* ---------- haptics ---------- */
export type Buzz = "tap" | "right" | "wrong" | "reveal" | "perfect";

const PATTERNS: Record<Buzz, number[]> = {
  tap: [8],
  right: [14],
  wrong: [30, 50, 30],
  reveal: [20, 60, 20],
  perfect: [20, 50, 20, 50, 60],
};

let iosSwitch: HTMLLabelElement | null = null;
/** iOS Safari has no vibrate(); toggling a native switch input gives one light tick (iOS 18+). */
function iosTick() {
  if (!iosSwitch) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.id = "ofd-haptic";
    input.style.display = "none";
    iosSwitch = document.createElement("label");
    iosSwitch.htmlFor = input.id;
    iosSwitch.style.display = "none";
    document.body.append(input, iosSwitch);
  }
  iosSwitch.click();
}

export function haptic(kind: Buzz): void {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(PATTERNS[kind]);
    return;
  }
  // one tick per pulse in the pattern, spaced like the pattern
  let at = 0;
  PATTERNS[kind].forEach((ms, i) => {
    if (i % 2 === 0) setTimeout(iosTick, at);
    at += ms + 40;
  });
}
