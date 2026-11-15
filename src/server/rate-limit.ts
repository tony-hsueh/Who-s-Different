export type RateLimitOptions = {
  maxRequests: number;
  windowMs: number;
};

export const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  maxRequests: 10,
  windowMs: 1000,
};

// Sliding window: a request is allowed while fewer than maxRequests were
// allowed in the last windowMs.
export class RateLimiter {
  private readonly allowedAt: number[] = [];

  constructor(
    private readonly options: RateLimitOptions,
    private readonly now: () => number,
  ) {}

  tryConsume(): boolean {
    const t = this.now();
    const windowStart = t - this.options.windowMs;
    while ((this.allowedAt[0] ?? Infinity) <= windowStart) {
      this.allowedAt.shift();
    }
    if (this.allowedAt.length >= this.options.maxRequests) return false;
    this.allowedAt.push(t);
    return true;
  }
}
