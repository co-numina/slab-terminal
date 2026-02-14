/**
 * GET /api/liquidations — Ecosystem-wide liquidation risk scanning.
 *
 * Strategy: Only parse positions in slabs that have active positions
 * (OI > 0 or small programs). Skip Launch's 10K+ empty slabs.
 * Always parse SOV mainnet (real money at stake).
 *
 * Cache: 15s — safety-critical, needs to be responsive.
 */
import { NextResponse } from 'next/server';
import { getCached, setCache } from '@/lib/connection';
import { scanEcosystem } from '@/lib/radar';
import { getSlabMarketData, type SlabDetail } from '@/lib/fetcher';

const CACHE_KEY = 'liquidations_response';
const CACHE_MS = 15_000;

// Programs where we always do full parse (small enough)
const ALWAYS_PARSE = new Set(['toly-original', 'sov-mainnet', 'launch-large']);

interface LiquidationEntry {
  slabAddress: string;
  program: string;
  programLabel: string;
  network: 'devnet' | 'mainnet';
  accountIndex: number;
  accountId: string;
  owner: string;
  side: string;
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnlPercent: number;
  collateral: number;
  health: number;
  liquidationPrice: number;
  distancePercent: number;
  isLP: boolean;
  status: string;
}

function extractLiquidations(detail: SlabDetail): LiquidationEntry[] {
  const entries: LiquidationEntry[] = [];

  for (const pos of detail.positions) {
    // Only include positions with health < 100
    if (pos.marginHealth >= 100) continue;

    // Calculate distance to liquidation
    let distancePercent = 0;
    if (pos.liquidationPrice > 0 && pos.markPrice > 0) {
      distancePercent = Math.abs((pos.liquidationPrice - pos.markPrice) / pos.markPrice) * 100;
    }

    entries.push({
      slabAddress: detail.slabPubkey,
      program: detail.programId,
      programLabel: detail.programLabel,
      network: detail.network,
      accountIndex: pos.accountIndex,
      accountId: pos.accountId,
      owner: pos.owner,
      side: pos.side,
      size: pos.size,
      entryPrice: pos.entryPrice,
      markPrice: pos.markPrice,
      unrealizedPnlPercent: pos.unrealizedPnlPercent,
      collateral: pos.collateral,
      health: pos.marginHealth,
      liquidationPrice: pos.liquidationPrice,
      distancePercent,
      isLP: pos.isLP,
      status: pos.status,
    });
  }

  return entries;
}

export async function GET() {
  try {
    const cached = getCached<Record<string, unknown>>(CACHE_KEY, CACHE_MS);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
      });
    }

    const radar = await scanEcosystem();

    // Determine which slabs to parse (with program hints)
    const slabsToParse: { pubkey: string; programId: string; network: 'devnet' | 'mainnet' }[] = [];

    for (const program of radar.programs) {
      if (ALWAYS_PARSE.has(program.id)) {
        for (const slab of program.slabs) {
          if (slab.numUsedAccounts > 0) {
            slabsToParse.push({ pubkey: slab.pubkey, programId: program.programId, network: program.network });
          }
        }
      } else {
        const activeSlabs = program.slabs
          .filter(s => s.numUsedAccounts > 0 && s.health !== 'dead')
          .sort((a, b) => b.numUsedAccounts - a.numUsedAccounts)
          .slice(0, 3);

        for (const slab of activeSlabs) {
          slabsToParse.push({ pubkey: slab.pubkey, programId: program.programId, network: program.network });
        }
      }
    }

    // Parse slabs and collect liquidation entries
    const allEntries: LiquidationEntry[] = [];
    let totalScanned = 0;
    let slabsParsed = 0;

    // Parse in parallel batches of 5 (with hints to skip resolution)
    for (let i = 0; i < slabsToParse.length; i += 5) {
      const batch = slabsToParse.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(s => getSlabMarketData(s.pubkey, {
          programId: s.programId,
          network: s.network,
        })),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const detail = result.value;
          totalScanned += detail.positions.length;
          slabsParsed++;
          const entries = extractLiquidations(detail);
          allEntries.push(...entries);
        }
      }
    }

    // Split into critical and warning
    const critical = allEntries
      .filter(e => e.health < 20)
      .sort((a, b) => a.health - b.health);

    const warning = allEntries
      .filter(e => e.health >= 20 && e.health < 50)
      .sort((a, b) => a.health - b.health);

    // Summary stats
    const mainnetPrograms = radar.programs.filter(p => p.network === 'mainnet');
    const mainnetAccounts = mainnetPrograms.reduce((s, p) => s + p.accountCount, 0);

    // Active positions (non-flat, non-LP)
    let activePositionCount = 0;
    let activeLongs = 0;
    let activeShorts = 0;
    // We only know this from fully-parsed slabs, but that's what we have
    for (const entry of allEntries) {
      if (entry.side === 'long') activeLongs++;
      if (entry.side === 'short') activeShorts++;
    }
    // Get broader counts from parsed data
    activePositionCount = activeLongs + activeShorts;

    const response = {
      critical,
      warning,
      summary: {
        totalScanned,
        slabsParsed,
        totalSlabs: radar.totals.totalSlabs,
        safeAccounts: totalScanned - allEntries.length,
        criticalCount: critical.length,
        warningCount: warning.length,
        mainnetAccounts,
        mainnetPrograms: mainnetPrograms.length,
      },
      generatedAt: new Date().toISOString(),
    };

    setCache(CACHE_KEY, response);

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
    });
  } catch (error: unknown) {
    console.error('GET /api/liquidations error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Liquidation scan failed', details: message },
      { status: 500 },
    );
  }
}
