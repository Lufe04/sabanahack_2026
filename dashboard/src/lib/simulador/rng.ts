/** Generador pseudoaleatorio con semilla (mulberry32) para datos reproducibles. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  uniform(a = 0, b = 1): number {
    return a + (b - a) * this.next();
  }

  normal(mu = 0, sigma = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  int(a: number, b: number): number {
    return Math.floor(this.uniform(a, b + 1));
  }

  choice<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  exp(mean: number): number {
    return -Math.log(1 - this.next()) * mean;
  }

  /** Semilla derivada, para sub-generadores independientes. */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967295));
  }
}

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const round = (x: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(x * f) / f;
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
