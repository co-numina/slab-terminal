/**
 * GET /api/top-markets?limit=10&sort=tvl
 *
 * Returns enriched data for the top N slabs across all programs.
 * Sorts by numUsedAccounts from radar headers, then does full config
 * parse on the top N to get TVL, OI, positions, price, health.
 *
 * Cache: 60s — full slab parses are expensive.
 */
import { NextResponse } from 'next/server';
import { getCached, setCache } from '@/lib/connection';
import { scanEcosystem } from '@/lib/radar';
import { getSlabMarketData, type SlabDetail } from '@/lib/fetcher';
import { resolveMintSymbol } from '@/lib/known-mints';

const CACHE_KEY = 'top_markets_response';
const CACHE_MS = 60_000;
const DEFAULT_LIMIT = 15;

interface MarketEntry {
  slabAddress: string;
  program: string;
  programId: string;
  network: 'devnet' | 'mainnet';
  collateralMint: string;
  collateralSymbol: string;
  price: number;
  tvl: number;
  tvlUsd: number;
  openInterest: number;
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

  // Worst health across all positions with active positions
  let worstHealth = 100;
  for (const pos of detail.positions) {
    if (pos.marginHealth < worstHealth) {
      worstHealth = pos.marginHealth;
    }
  }

  return {
    slabAddress: detail.slabPubkey,
    program: detail.programLabel,
    programId: detail.programId,
    network: detail.network,
    collateralMint: detail.config.collateralMint,
    collateralSymbol: resolveMintSymbol(detail.config.collateralMint),
    price: detail.solUsdPrice,
    tvl: detail.vaultBalanceSol,
    tvlUsd: detail.tvlUsd,
    openInterest: detail.openInterestSol,
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
    const allSlabs: { pubkey: string; program: string; network: string; accounts: number; crankAge: number }[] = [];

    for (const program of radar.programs) {
      for (const slab of program.slabs) {
        if (slab.numUsedAccounts > 0) {
          allSlabs.push({
            pubkey: slab.pubkey,
            program: program.id,
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

    // Parse in batches of 3 to avoid rate limits
    for (let i = 0; i < topSlabs.length; i += 3) {
      const batch = topSlabs.slice(i, i + 3);
      const results = await Promise.allSettled(
        batch.map(async (slab) => {
          const detail = await getSlabMarketData(slab.pubkey);
          return buildMarketEntry(detail, slab.crankAge);
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          markets.push(result.value);
        }
      }
    }

    // Default sort: by TVL desc
    markets.sort((a, b) => b.tvl - a.tvl);

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
