export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(minMs: number, maxMs: number): number {
  if (minMs >= maxMs) return minMs;
  return Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
}
