/** Seeded pseudo-random number generator (Mulberry32). */
export function createRng(seed: number) {
  let s = seed >>> 0;
  return {
    /** Returns a float in [0, 1). */
    next(): number {
      s += 0x6d2b79f5;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** Returns an integer in [0, max). */
    int(max: number): number {
      return Math.floor(this.next() * max);
    },
  };
}

/** Default global RNG seeded from current time. */
export const rng = createRng(Date.now());
