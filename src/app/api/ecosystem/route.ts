/**
 * GET /api/ecosystem — Aggregated ecosystem stats for HOME view.
 *
 * Uses radar data (header-level) + targeted full parses on small programs
 * (Toly: 48 accts, SOV: 253 accts) for position breakdowns.
 * Launch's 10K+ accounts get header-level stats only.
 */
import { NextResponse } from 'next/server';
import { getCached, setCache } from '@/lib/connection';
import { scanEcosystem } from '@/lib/radar';
import { getSlabMarketData } from '@/lib/fetcher';

const CACHE_KEY = 'ecosystem_response';
const CACHE_MS = 30_000;

// Programs small enough to do full position parsing
const PARSE_PROGRAMS = new Set(['toly-original', 'sov-mainnet', 'launch-large']);

export async function GET() {
  try {
    const cached = getCached<Record<string, unknown>>(CACHE_KEY, CACHE_MS);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      });
    }

    const radar = await scanEcosystem();

    // Aggregate basic counts from radar
    let totalAccounts = 0;
    let devnetAccounts = 0;
    let mainnetAccounts = 0;
    let devnetSlabs = 0;
    let mainnetSlabs = 0;
    let devnetPrograms = 0;
    let mainnetPrograms = 0;
    let activeSlabs = 0;

    for (const p of radar.programs) {
      totalAccounts += p.accountCount;
      if (p.network === 'devnet') {
        devnetAccounts += p.accountCount;
        devnetSlabs += p.slabCount;
        devnetPrograms++;
      } else {
        mainnetAccounts += p.accountCount;
        mainnetSlabs += p.slabCount;
        mainnetPrograms++;
      }
      activeSlabs += p.activeSlabCount;
    }

    // Parse positions from small programs for position breakdown
    let activeLongs = 0;
    let activeShorts = 0;
    let flatAccounts = 0;
    let parsedAccountCount = 0;
    let unparsedAccountCount = 0;

    // Collect TVL by collateral token
    const tvlByToken: Record<string, { amount: number; network: string }> = {};

    // Parse slabs from small programs
    for (const program of radar.programs) {
      if (PARSE_PROGRAMS.has(program.id) && program.slabs.length > 0) {
        // Parse top 5 slabs per program (most active)
        const slabsToParse = program.slabs
          .filter(s => s.numUsedAccounts > 0)
          .slice(0, 5);

        for (const slab of slabsToParse) {
          try {
            const detail = await getSlabMarketData(slab.pubkey);
            parsedAccountCount += detail.positions.length;

            for (const pos of detail.positions) {
              if (pos.side === 'long') activeLongs++;
              else if (pos.side === 'short') activeShorts++;
              else flatAccounts++;
            }

            // TVL aggregation
            const mintSymbol = detail.config.collateralMint.length > 20
              ? (detail.config.collateralMint === 'So11111111111111111111111111111111111111112' ? 'SOL' :
                 detail.config.collateralMint.endsWith('perc') ? 'PERC' :
                 detail.config.collateralMint.slice(0, 6) + '...')
              : detail.config.collateralMint;

            const key = `${mintSymbol}_${detail.network}`;
            if (!tvlByToken[key]) {
              tvlByToken[key] = { amount: 0, network: detail.network };
            }
            tvlByToken[key].amount += detail.vaultBalanceSol;
          } catch (err) {
            console.warn(`[ecosystem] Failed to parse ${slab.pubkey.slice(0, 8)}: ${err}`);
          }
        }
      } else {
        // Count as unparsed
        unparsedAccountCount += program.accountCount;
      }
    }

    const response = {
      programs: {
        total: radar.programs.length,
        active: radar.totals.activePrograms,
        stale: radar.totals.stalePrograms,
        idle: radar.totals.idlePrograms,
        dead: radar.totals.deadPrograms,
      },
      slabs: {
        total: radar.totals.totalSlabs,
        withAccounts: activeSlabs,
        byNetwork: { devnet: devnetSlabs, mainnet: mainnetSlabs },
      },
      accounts: {
        total: totalAccounts,
        byNetwork: { devnet: devnetAccounts, mainnet: mainnetAccounts },
      },
      positions: {
        activeLongs,
        activeShorts,
        flat: flatAccounts,
        parsed: parsedAccountCount,
        unparsed: unparsedAccountCount,
      },
      tvl: tvlByToken,
      networks: {
        devnet: { programs: devnetPrograms, slabs: devnetSlabs, accounts: devnetAccounts },
        mainnet: { programs: mainnetPrograms, slabs: mainnetSlabs, accounts: mainnetAccounts },
      },
      // Pass through program summaries for program-status cards
      programSummaries: radar.programs.map(p => ({
        id: p.id,
        label: p.label,
        programId: p.programId,
        network: p.network,
        description: p.description,
        health: p.health,
        slabCount: p.slabCount,
        activeSlabCount: p.activeSlabCount,
        accountCount: p.accountCount,
        lastCrankAge: p.lastCrankAge,
        error: p.error,
      })),
      lastScan: radar.scanTimestamp,
      scanDurationMs: radar.scanDurationMs,
    };

    setCache(CACHE_KEY, response);

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (error: unknown) {
    console.error('GET /api/ecosystem error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Ecosystem fetch failed', details: message },
      { status: 500 },
    );
  }
}
