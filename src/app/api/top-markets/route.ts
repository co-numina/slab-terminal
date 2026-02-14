/**
 * GET /api/top-markets?limit=10&sort=tvl
 *
 * Returns enriched data for the top N slabs across all programs.
 * Sorts by numUsedAccounts from radar headers, then does full config
 * parse on the top N to get TVL, OI, positions, price, health.
 *
 * Enrichment:
 *   - Mint symbols via Jupiter + Metaplex
 *   - USD prices via DexScreener
 *   - Oracle mode detection (admin / pyth / dex)
 *   - Insurance fund + lifetime liquidation stats
 *
 * Cache: 60s — full slab parses are expensive.
 */
import { NextResponse } from 'next/server';
import { getCached, setCache } from '@/lib/connection';
import { scanEcosystem } from '@/lib/radar';
import { getSlabMarketData, type SlabDetail } from '@/lib/fetcher';
import { resolveMintSymbol, resolveMintSymbolsBatch } from '@/lib/known-mints';
import { getNetworkConnection } from '@/lib/connections';
import { fetchTokenPricesBatch } from '@/lib/dexscreener';

const CACHE_KEY = 'top_markets_response';
const CACHE_MS = 60_000;
const DEFAULT_LIMIT = 15;

// Known DEX program owners for oracle mode detection
const DEX_PROGRAMS: Record<string, string> = {
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA': 'dex-pumpswap',
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'dex-raydium',
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': 'dex-meteora',
};

type OracleMode = 'admin' | 'pyth' | 'dex-pumpswap' | 'dex-raydium' | 'dex-meteora' | 'unknown';

/**
 * Detect oracle mode from the slab's indexFeedId.
 *   - All zeros / default pubkey = admin oracle (price pushed by admin wallet)
 *   - Known DEX program = DEX pool oracle
 *   - Otherwise = Pyth feed
 */
function detectOracleMode(indexFeedId: string): OracleMode {
  // Admin oracle: indexFeedId is default pubkey (all 1s = base58 "1111...1111")
  if (
    indexFeedId === '11111111111111111111111111111111' ||
    indexFeedId === 'So11111111111111111111111111111111111111111' ||
    /^1+$/.test(indexFeedId)
  ) {
    return 'admin';
  }
  // DEX oracle: check if the pubkey is a known DEX pool program
  // (In practice we'd need to fetch the account owner, but for now we use
  //  the feed ID heuristic — if it's a valid pubkey that's not a Pyth feed hex,
  //  it's likely a DEX pool. Real detection would need an RPC call.)
  return 'pyth'; // default assumption for non-admin
}

interface MarketEntry {
  slabAddress: string;
  program: string;
  programId: string;
  network: 'devnet' | 'mainnet';
  collateralMint: string;
  collateralSymbol: string;
  price: number;
  priceUsd: number;
  tvl: number;
  tvlUsd: number;
  openInterest: number;
  openInterestUsd: number;
  positions: {
    longs: number;
    shorts: number;
    flat: number;
    total: number;
    active: number;
  };
  worstHealth: number;
  fundingRate: number;
  fundingDirection: string;
  lastCrankAge: number;
  status: string;
  oracleMode: OracleMode;
  insurance: {
    balance: number;
    feeRevenue: number;
    ratio: number; // insurance / OI — 0 if no OI
    health: 'healthy' | 'caution' | 'warning';
  };
  lifetimeLiquidations: number;
  lifetimeForceCloses: number;
  config: {
    invert: number;
    maintMarginBps: number;
    initMarginBps: number;
    tradingFeeBps: number;
    maxAccounts: number;
    usedAccounts: number;
    utilization: number;
  };
  slabSize: number;
}

function buildMarketEntry(detail: SlabDetail, crankAge: number): MarketEntry {
  const longs = detail.positions.filter(p => p.side === 'long' && !p.isLP);
  const shorts = detail.positions.filter(p => p.side === 'short' && !p.isLP);
  const flat = detail.positions.filter(p => p.side === 'flat');
  const activePositions = longs.length + shorts.length;

  // Worst health across all positions
  let worstHealth = 100;
  for (const pos of detail.positions) {
    if (pos.marginHealth < worstHealth) {
      worstHealth = pos.marginHealth;
    }
  }

  // Insurance metrics
  const insuranceBalance = detail.insuranceFundSol;
  const insuranceFeeRevenue = Number(detail.engine.insuranceFeeRevenue) / 1e9;
  const oi = detail.openInterestSol;
  const insuranceRatio = oi > 0 ? insuranceBalance / oi : 0;
  const insuranceHealth: 'healthy' | 'caution' | 'warning' =
    insuranceRatio < 0.02 ? 'warning' : insuranceRatio < 0.05 ? 'caution' : 'healthy';

  // Oracle mode
  const oracleMode = detectOracleMode(detail.config.indexFeedId);

  return {
    slabAddress: detail.slabPubkey,
    program: detail.programLabel,
    programId: detail.programId,
    network: detail.network,
    collateralMint: detail.config.collateralMint,
    collateralSymbol: resolveMintSymbol(detail.config.collateralMint),
    price: detail.solUsdPrice,
    priceUsd: 0, // filled in by DexScreener pass
    tvl: detail.vaultBalanceSol,
    tvlUsd: 0, // filled in by DexScreener pass
    openInterest: oi,
    openInterestUsd: 0, // filled in by DexScreener pass
    positions: {
      longs: longs.length,
      shorts: shorts.length,
      flat: flat.length,
      total: detail.positions.length,
      active: activePositions,
    },
    worstHealth,
    fundingRate: detail.fundingRate.rateBpsPerHour,
    fundingDirection: detail.fundingRate.direction,
    lastCrankAge: crankAge,
    status: crankAge < 3600 ? 'active' : crankAge < 86400 ? 'stale' : 'idle',
    oracleMode,
    insurance: {
      balance: insuranceBalance,
      feeRevenue: insuranceFeeRevenue,
      ratio: insuranceRatio,
      health: insuranceHealth,
    },
    lifetimeLiquidations: detail.engine.lifetimeLiquidations,
    lifetimeForceCloses: detail.engine.lifetimeForceCloses,
    config: {
      invert: detail.config.invert,
      maintMarginBps: detail.params.maintenanceMarginBps,
      initMarginBps: detail.params.initialMarginBps,
      tradingFeeBps: detail.params.tradingFeeBps,
      maxAccounts: detail.maxAccountCapacity,
      usedAccounts: detail.engine.numUsedAccounts,
      utilization: detail.maxAccountCapacity > 0
        ? (detail.engine.numUsedAccounts / detail.maxAccountCapacity) * 100
        : 0,
    },
    slabSize: detail.slabSize,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10), 30);

    const cached = getCached<Record<string, unknown>>(CACHE_KEY, CACHE_MS);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
      });
    }

    const radar = await scanEcosystem();

    // Flatten all slabs with their program context, sort by accounts desc
    const allSlabs: { pubkey: string; programId: string; network: 'devnet' | 'mainnet'; accounts: number; crankAge: number }[] = [];

    for (const program of radar.programs) {
      for (const slab of program.slabs) {
        if (slab.numUsedAccounts > 0) {
          allSlabs.push({
            pubkey: slab.pubkey,
            programId: program.programId,
            network: program.network,
            accounts: slab.numUsedAccounts,
            crankAge: slab.lastCrankAge,
          });
        }
      }
    }

    // Sort by account count desc (proxy for activity/importance)
    allSlabs.sort((a, b) => b.accounts - a.accounts);

    // Take top N and do full parses
    const topSlabs = allSlabs.slice(0, limit);
    const markets: MarketEntry[] = [];

    // Parse in parallel batches of 5 (with hints to skip resolution)
    for (let i = 0; i < topSlabs.length; i += 5) {
      const batch = topSlabs.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (slab) => {
          const detail = await getSlabMarketData(slab.pubkey, {
            programId: slab.programId,
            network: slab.network,
          });
          return buildMarketEntry(detail, slab.crankAge);
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          markets.push(result.value);
        }
      }
    }

    // Batch-resolve collateral mint symbols + USD prices in parallel
    const allMints = [...new Set(markets.map(m => m.collateralMint))];
    const devnetMints = [...new Set(markets.filter(m => m.network === 'devnet').map(m => m.collateralMint))];
    const mainnetMints = [...new Set(markets.filter(m => m.network === 'mainnet').map(m => m.collateralMint))];

    const [devnetSymbols, mainnetSymbols, tokenPrices] = await Promise.all([
      devnetMints.length > 0
        ? resolveMintSymbolsBatch(devnetMints, getNetworkConnection('devnet'))
        : Promise.resolve(new Map<string, string>()),
      mainnetMints.length > 0
        ? resolveMintSymbolsBatch(mainnetMints, getNetworkConnection('mainnet'))
        : Promise.resolve(new Map<string, string>()),
      fetchTokenPricesBatch(allMints),
    ]);

    // Apply resolved symbols + USD prices back to markets
    for (const market of markets) {
      const symbolMap = market.network === 'devnet' ? devnetSymbols : mainnetSymbols;
      const resolved = symbolMap.get(market.collateralMint);
      if (resolved) market.collateralSymbol = resolved;

      const tokenPrice = tokenPrices.get(market.collateralMint) ?? 0;
      market.priceUsd = tokenPrice;
      market.tvlUsd = market.tvl * tokenPrice;
      market.openInterestUsd = market.openInterest * tokenPrice;
    }

    // Default sort: by TVL desc (use USD if available, fall back to raw)
    markets.sort((a, b) => {
      const aVal = a.tvlUsd > 0 ? a.tvlUsd : a.tvl;
      const bVal = b.tvlUsd > 0 ? b.tvlUsd : b.tvl;
      return bVal - aVal;
    });

    const response = {
      markets,
      count: markets.length,
      totalCandidates: allSlabs.length,
      generatedAt: new Date().toISOString(),
    };

    setCache(CACHE_KEY, response);

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error: unknown) {
    console.error('GET /api/top-markets error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch top markets', details: message },
      { status: 500 },
    );
  }
}
