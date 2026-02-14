/**
 * In-memory price history accumulator.
 *
 * Records price + TVL + OI snapshots for slabs over time.
 * Data is accumulated server-side whenever slab detail is fetched,
 * giving the frontend an immediate chart on first load.
 *
 * Limits:
 *   - Max 360 data points per slab (~1 hour at 10s intervals)
 *   - Max 50 tracked slabs (LRU eviction)
 *   - All data is in-memory (lost on server restart)
 */

export interface PricePoint {
  /** ISO timestamp */
  t: string;
  /** Price in USD */
  p: number;
  /** TVL in SOL */
  tvl: number;
  /** Open interest in SOL */
  oi: number;
  /** Funding rate bps/hour */
  fr: number;
}

const MAX_POINTS_PER_SLAB = 360;  // ~1 hour at 10s intervals
const MAX_TRACKED_SLABS = 50;
const MIN_INTERVAL_MS = 5_000;     // Don't record faster than every 5s

interface SlabHistory {
  points: PricePoint[];
  lastRecordedAt: number;
}

const historyStore = new Map<string, SlabHistory>();

/**
 * Record a price snapshot for a slab.
 * Called from the slab detail API route after fetching data.
 * Deduplicates by enforcing a minimum interval between recordings.
 */
export function recordPricePoint(
  slabAddress: string,
  point: PricePoint,
): void {
  const now = Date.now();
  let history = historyStore.get(slabAddress);

  if (history) {
    // Skip if too recent
    if (now - history.lastRecordedAt < MIN_INTERVAL_MS) return;

    history.points.push(point);
    history.lastRecordedAt = now;

    // Trim to max
    if (history.points.length > MAX_POINTS_PER_SLAB) {
      history.points = history.points.slice(-MAX_POINTS_PER_SLAB);
    }
  } else {
    // Evict LRU if at capacity
    if (historyStore.size >= MAX_TRACKED_SLABS) {
      let oldestKey = '';
      let oldestTime = Infinity;
      for (const [key, val] of historyStore) {
        if (val.lastRecordedAt < oldestTime) {
          oldestTime = val.lastRecordedAt;
          oldestKey = key;
        }
      }
      if (oldestKey) historyStore.delete(oldestKey);
    }

    history = { points: [point], lastRecordedAt: now };
    historyStore.set(slabAddress, history);
  }
}

/**
 * Get accumulated price history for a slab.
 * Returns empty array if no history exists.
 */
export function getPriceHistory(slabAddress: string): PricePoint[] {
  return historyStore.get(slabAddress)?.points ?? [];
}
