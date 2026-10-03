// Tiny synthesized sounds (no files): soft footsteps, pops, a school bell, a
// whoosh for going inside, and a gentle sea hush. Off by default; this module
// is plain TS with no three.js so the HUD can own it.

type Name = 'step' | 'pop' | 'bell' | 'whoosh' | 'chime' | 'land' | 'tap';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private sea: AudioBufferSourceNode | null = null;
  on = false;

  private ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brown-ish
      d[i] = w * 0.5 + last * 3;
    }
    this.noise = buf;
    return ctx;
  }

  setOn(on: boolean) {
    this.on = on;
    if (on) {
      const ctx = this.ensure();
      if (!ctx) return;
      void ctx.resume();
      this.startSea();
      this.play('chime');
    } else {
      this.stopSea();
      void this.ctx?.suspend();
    }
  }

  private startSea() {
    const ctx = this.ctx;
    if (!ctx || !this.noise || this.sea) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.035;
    lfo.connect(lfoG).connect(g.gain);
    src.connect(lp).connect(g).connect(this.master!);
    src.start();
    lfo.start();
    this.sea = src;
  }
  private stopSea() {
    try {
      this.sea?.stop();
    } catch {
      /* already stopped */
    }
    this.sea = null;
  }

  play(name: Name) {
    if (!this.on || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = this.master;
    const env = (g: GainNode, peak: number, a: number, d: number) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    };
    const osc = (type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + delay);
      o.frequency.exponentialRampToValueAtTime(f1, t + delay + dur);
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(peak, t + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      o.connect(g).connect(out);
      o.start(t + delay);
      o.stop(t + delay + dur + 0.05);
    };
    const noise = (freq: number, q: number, dur: number, peak: number, type: BiquadFilterType = 'bandpass') => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      env(g, peak, 0.005, dur);
      s.connect(f).connect(g).connect(out);
      s.start(t, Math.random());
      s.stop(t + dur + 0.05);
      return f;
    };
    switch (name) {
      case 'step':
        noise(900 + Math.random() * 500, 1.2, 0.06, 0.12);
        break;
      case 'tap':
        osc('sine', 880, 660, 0.08, 0.08);
        break;
      case 'pop':
        osc('sine', 520 + Math.random() * 200, 180, 0.14, 0.22);
        break;
      case 'land':
        osc('sine', 180, 60, 0.18, 0.25);
        noise(500, 0.8, 0.12, 0.12);
        break;
      case 'chime':
        osc('sine', 784, 784, 0.5, 0.12);
        osc('sine', 1175, 1175, 0.6, 0.08, 0.09);
        break;
      case 'bell':
        for (const [f, p, d] of [[660, 0.18, 1.6], [1320, 0.07, 1.0], [1650, 0.05, 0.7], [2310, 0.03, 0.5]] as const) osc('sine', f, f * 0.995, d, p);
        break;
      case 'whoosh': {
        const f = noise(300, 0.7, 0.75, 0.25);
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(2400, t + 0.6);
        break;
      }
    }
  }

  dispose() {
    this.stopSea();
    void this.ctx?.close();
    this.ctx = null;
  }
}
