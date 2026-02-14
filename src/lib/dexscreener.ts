/**
 * DexScreener price resolver — fetches real USD prices for SPL tokens.
 *
 * API: https://api.dexscreener.com/latest/dex/tokens/<MINT>
 * Returns the highest-liquidity pair's priceUsd for each token.
 *
 * Used to fix USD TVL calculations that were using broken oracle prices.
 * Cache: 60s per mint, in-memory.
 */

interface DexScreenerPair {
  priceUsd: string;
  liquidity: { usd: number };
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

// In-memory price cache: mint → { priceUsd, timestamp }
const priceCache = new Map<string, { priceUsd: number; ts: number }>();
const CACHE_TTL_MS = 60_000; // 60s

/**
 * Fetch USD price for a single mint from DexScreener.
 * Returns 0 if the token has no listed pairs.
 */
async function fetchDexScreenerPrice(mintAddress: string): Promise<number> {
  // Check cache
  const cached = priceCache.get(mintAddress);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.priceUsd;
  }

  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return 0;

    const data = (await res.json()) as DexScreenerResponse;
    if (!data.pairs || data.pairs.length === 0) return 0;

    // Sort by liquidity desc, take highest
    const sorted = [...data.pairs]
      .filter(p => p.priceUsd && p.liquidity?.usd > 0)
      .sort((a, b) => b.liquidity.usd - a.liquidity.usd);

    const priceUsd = sorted.length > 0 ? parseFloat(sorted[0].priceUsd) : 0;

    priceCache.set(mintAddress, { priceUsd, ts: Date.now() });
    return priceUsd;
  } catch {
    return 0;
  }
}

/**
 * Batch-fetch USD prices for multiple mints.
 * DexScreener doesn't have a batch endpoint, so we fire parallel requests
 * with concurrency cap.
 */
export async function fetchTokenPricesBatch(
  mintAddresses: string[],
): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  const unique = [...new Set(mintAddresses)];

  // Check cache first
  const toFetch: string[] = [];
  for (const addr of unique) {
    const cached = priceCache.get(addr);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      results.set(addr, cached.priceUsd);
    } else {
      toFetch.push(addr);
    }
  }

  if (toFetch.length === 0) return results;

  // Fetch in parallel, cap at 5 concurrent (DexScreener rate limits)
  for (let i = 0; i < toFetch.length; i += 5) {
    const batch = toFetch.slice(i, i + 5);
    const settled = await Promise.allSettled(
      batch.map(async (mint) => {
        const price = await fetchDexScreenerPrice(mint);
        return { mint, price };
      }),
    );
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.set(result.value.mint, result.value.price);
      }
    }
  }

  return results;
}
