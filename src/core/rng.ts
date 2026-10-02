/**
 * Deterministic seeded RNG (mulberry32). Everything random in this project —
 * training shuffles, synthetic problems, demo problems — flows through these,
 * so runs are reproducible.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private nextFloat: () => number;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.nextFloat = mulberry32(seed);
  }

  float(): number {
    return this.nextFloat();
  }

  int(lo: number, hi: number): number {
    return lo + Math.floor(this.nextFloat() * (hi - lo + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  shuffle<T>(arr: T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  chance(p: number): boolean {
    return this.nextFloat() < p;
  }
}
