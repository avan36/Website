// Fishing off the pier, as a tiny timing game: cast, wait while the bobber
// gets a nibble or two, then it dunks and you have a moment to pull. Pure
// timing with no drawing in it; the renderer animates whatever phase it's in.

export type FishPhase = 'idle' | 'cast' | 'wait' | 'bite' | 'reel';
/** What just happened, for sound and animation. */
export type FishEvent = 'plop' | 'nibble' | 'bite' | 'escaped' | 'landed' | 'empty';

/** Seconds the bobber is in the air. */
export const CAST_TIME = 0.55;
/** Seconds you have to pull once it bites. */
export const BITE_WINDOW = 0.9;
/** Seconds to wind the line back in. */
export const REEL_TIME = 0.6;
/** Seconds a nibble jiggles the bobber. */
export const NIBBLE_TIME = 0.32;

export class Fishing {
  phase: FishPhase = 'idle';
  /** Seconds since the phase began. */
  t = 0;
  /** Whether the line now being reeled in has something on it. */
  hooked = false;
  private biteAt = 0;
  private nibbles: number[] = [];
  private nibbleIx = 0;
  private lastNibble = -Infinity;

  constructor(private random: () => number = Math.random) {}

  /** Throw the line out. False if it's already out. */
  cast() {
    if (this.phase !== 'idle') return false;
    this.phase = 'cast';
    this.t = 0;
    this.hooked = false;
    this.biteAt = 1.3 + this.random() * 2.2;
    // One or two false alarms first, well clear of the real bite.
    const n = 1 + Math.floor(this.random() * 2);
    this.nibbles = [];
    for (let i = 0; i < n; i++) this.nibbles.push(0.45 + ((this.biteAt - 0.9) * (i + 0.3 + this.random() * 0.5)) / n);
    this.nibbleIx = 0;
    this.lastNibble = -Infinity;
    return true;
  }

  update(dt: number): FishEvent | null {
    if (this.phase === 'idle') return null;
    this.t += dt;
    switch (this.phase) {
      case 'cast':
        if (this.t < CAST_TIME) return null;
        return this.enter('wait'), 'plop';
      case 'wait':
        if (this.nibbleIx < this.nibbles.length && this.t >= this.nibbles[this.nibbleIx]) {
          this.lastNibble = this.nibbles[this.nibbleIx++];
          return 'nibble';
        }
        if (this.t < this.biteAt) return null;
        return this.enter('bite'), 'bite';
      case 'bite':
        if (this.t < BITE_WINDOW) return null;
        this.hooked = false;
        return this.enter('reel'), 'escaped';
      case 'reel':
        if (this.t < REEL_TIME) return null;
        this.enter('idle');
        return this.hooked ? 'landed' : 'empty';
    }
  }

  /** The visitor pulled the line. 'hooked' in time, 'early' before the bite. */
  pull(): 'hooked' | 'early' | null {
    if (this.phase === 'bite') {
      this.hooked = true;
      this.enter('reel');
      return 'hooked';
    }
    if (this.phase === 'cast' || this.phase === 'wait') {
      this.hooked = false;
      this.enter('reel');
      return 'early';
    }
    return null;
  }

  /** Walked away: the line just comes back. */
  cancel() {
    this.enter('idle');
    this.hooked = false;
  }

  /** 0..1 through the current nibble, or -1 if the bobber is still. */
  nibble() {
    if (this.phase !== 'wait') return -1;
    const k = (this.t - this.lastNibble) / NIBBLE_TIME;
    return k >= 0 && k < 1 ? k : -1;
  }

  private enter(p: FishPhase) {
    this.phase = p;
    this.t = 0;
  }
}
