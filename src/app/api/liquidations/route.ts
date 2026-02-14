/**
 * GET /api/liquidations — Ecosystem-wide liquidation risk scanning.
 *
 * Strategy: Only parse positions in slabs that have active positions
 * (OI > 0 or small programs). Skip Launch's 10K+ empty slabs.
 * Always parse SOV mainnet (real money at stake).
 *
 * Performance: batch getMultipleAccountsInfo per network instead of
 * per-slab getSlabMarketData() calls. All slab parsing is CPU-only.
 *
 * Cache: 15s — safety-critical, needs to be responsive.
 */
import { PublicKey } from '@solana/web3.js';
import { NextResponse } from 'next/server';
import { getCached, setCache } from '@/lib/connection';
import { scanEcosystem } from '@/lib/radar';
import { batchFetchAccounts } from '@/lib/fetcher';
import { parseConfig, parseParams, parseAllAccounts, computeMarginMetrics, estimateLiquidationPrice } from '@/lib/percolator';
import { getEffectiveOraclePrice } from '@/lib/oracle';
import { getNetworkConnection } from '@/lib/connections';
import { AccountKind } from '@/lib/types';

const CACHE_KEY = 'liquidations_response';
const CACHE_MS = 15_000;

// Programs where we always do full parse (small enough)
const ALWAYS_PARSE = new Set(['toly-original', 'sov-mainnet', 'launch-large']);

interface SlabParseJob {
  pubkey: string;
  programId: string;
  programLabel: string;
  network: 'devnet' | 'mainnet';
}

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

/**
 * Parse a slab buffer and extract all positions with health < 100.
 * Pure CPU operation — no RPC calls.
 */
function extractLiquidationsFromBuffer(
  slabData: Buffer,
  job: SlabParseJob,
): { entries: LiquidationEntry[]; positionCount: number } {
  const config = parseConfig(slabData);
  const params = parseParams(slabData);
  const allAccounts = parseAllAccounts(slabData);

  // Oracle price from slab's last effective price
  const oraclePriceE6 = config.lastEffectivePriceE6 > 0n
    ? config.lastEffectivePriceE6
    : 0n;
  const solUsdPrice = oraclePriceE6 > 0n
    ? getEffectiveOraclePrice(oraclePriceE6, config.invert)
    : 0;

  const entries: LiquidationEntry[] = [];

  for (const { idx, account } of allAccounts) {
    const metrics = computeMarginMetrics(account, oraclePriceE6, params);

    // Only include positions with health < 100
    if (metrics.health >= 100) continue;

    const isLP = account.kind === AccountKind.LP;

    let side: 'long' | 'short' | 'flat';
    if (account.positionSize === 0n) side = 'flat';
    else if (account.positionSize > 0n) side = 'short'; // inverted market
    else side = 'long';

    const collateral = Number(account.capital) / 1e9;
    const unrealizedPnlSol = Number(metrics.unrealizedPnl) / 1e9;
    const size = Number(metrics.notionalLamports) / 1e9;
    const entryPrice = Number(account.entryPrice) > 0
      ? 1_000_000 / Number(account.entryPrice)
      : 0;

    const liqPriceE6 = estimateLiquidationPrice(account, params);
    const liquidationPrice = liqPriceE6 > 0 ? 1_000_000 / liqPriceE6 : 0;

    let distancePercent = 0;
    if (liquidationPrice > 0 && solUsdPrice > 0) {
      distancePercent = Math.abs((liquidationPrice - solUsdPrice) / solUsdPrice) * 100;
    }

    entries.push({
      slabAddress: job.pubkey,
      program: job.programId,
      programLabel: job.programLabel,
      network: job.network,
      accountIndex: idx,
      accountId: account.accountId.toString(),
      owner: account.owner.toBase58(),
      side,
      size,
      entryPrice,
      markPrice: solUsdPrice,
      unrealizedPnlPercent: collateral > 0 ? (unrealizedPnlSol / collateral) * 100 : 0,
      collateral,
      health: metrics.health,
      liquidationPrice,
      distancePercent,
      isLP,
      status: metrics.status,
    });
  }

  return { entries, positionCount: allAccounts.length };
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

    // Determine which slabs to parse
    const slabJobs: SlabParseJob[] = [];

    for (const program of radar.programs) {
      if (ALWAYS_PARSE.has(program.id)) {
        for (const slab of program.slabs) {
          if (slab.numUsedAccounts > 0) {
            slabJobs.push({
              pubkey: slab.pubkey,
              programId: program.programId,
              programLabel: program.label,
              network: program.network,
            });
          }
        }
      } else {
        const activeSlabs = program.slabs
          .filter(s => s.numUsedAccounts > 0 && s.health !== 'dead')
          .sort((a, b) => b.numUsedAccounts - a.numUsedAccounts)
          .slice(0, 3);

        for (const slab of activeSlabs) {
          slabJobs.push({
            pubkey: slab.pubkey,
            programId: program.programId,
            programLabel: program.label,
            network: program.network,
          });
        }
      }
    }

    // ── BATCH FETCH: single getMultipleAccountsInfo per network ─────────

    const devnetJobs = slabJobs.filter(j => j.network === 'devnet');
    const mainnetJobs = slabJobs.filter(j => j.network === 'mainnet');

    const [devnetSlabData, mainnetSlabData] = await Promise.all([
      devnetJobs.length > 0
        ? batchFetchAccounts(
            getNetworkConnection('devnet'),
            devnetJobs.map(j => new PublicKey(j.pubkey)),
            10,
          )
        : Promise.resolve([] as (Buffer | null)[]),
      mainnetJobs.length > 0
        ? batchFetchAccounts(
            getNetworkConnection('mainnet'),
            mainnetJobs.map(j => new PublicKey(j.pubkey)),
            10,
          )
        : Promise.resolve([] as (Buffer | null)[]),
    ]);

    // ── PARSE: all CPU, no RPC ──────────────────────────────────────────

    const allEntries: LiquidationEntry[] = [];
    let totalScanned = 0;
    let slabsParsed = 0;

    function processBatch(jobs: SlabParseJob[], dataArr: (Buffer | null)[]) {
      for (let i = 0; i < jobs.length; i++) {
        const data = dataArr[i];
        if (!data) continue;

        try {
          const { entries, positionCount } = extractLiquidationsFromBuffer(data, jobs[i]);
          totalScanned += positionCount;
          slabsParsed++;
          allEntries.push(...entries);
        } catch (err) {
          console.warn(`[liquidations] Failed to parse slab ${jobs[i].pubkey}:`, err);
        }
      }
    }

    processBatch(devnetJobs, devnetSlabData);
    processBatch(mainnetJobs, mainnetSlabData);

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
