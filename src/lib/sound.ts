let ctx: AudioContext | null = null;
let enabled = true;

function ensure(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur = 0.09, type: OscillatorType = "sine", gain = 0.04, delay = 0) {
  const ac = ensure();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (on) ensure();
}

export const sfx = {
  click() {
    tone(620, 0.05, "triangle", 0.028);
  },
  tap() {
    tone(440, 0.06, "sine", 0.03);
  },
  send() {
    tone(660, 0.07, "sine", 0.03);
    tone(880, 0.08, "sine", 0.025, 0.06);
  },
  flip() {
    tone(330, 0.09, "triangle", 0.035);
    tone(495, 0.1, "triangle", 0.03, 0.05);
  },
  correct() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, "sine", 0.038, i * 0.085));
  },
  wrong() {
    tone(220, 0.14, "triangle", 0.03);
    tone(180, 0.18, "triangle", 0.025, 0.09);
  },
  win() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, "triangle", 0.04, i * 0.1));
  },
  reaction() {
    tone(880, 0.08, "sine", 0.03);
    tone(1174, 0.12, "sine", 0.025, 0.06);
  },
  tick() {
    tone(1000, 0.035, "square", 0.012);
  },
};
