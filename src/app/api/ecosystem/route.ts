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
import { resolveMintSymbolsBatch } from '@/lib/known-mints';
import { getNetworkConnection } from '@/lib/connections';

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

    // Collect unique wallet owners
    const uniqueOwners = new Set<string>();
    const SYSTEM_PROGRAM = '11111111111111111111111111111111';
    const ZERO_ADDRESS = '11111111111111111111111111111111111111111111';

    // Collect all slab parse jobs with hints (skip expensive resolveSlabProgram)
    const slabJobs: { pubkey: string; programId: string; network: 'devnet' | 'mainnet' }[] = [];

    for (const program of radar.programs) {
      if (PARSE_PROGRAMS.has(program.id) && program.slabs.length > 0) {
        const slabsToParse = program.slabs
          .filter(s => s.numUsedAccounts > 0)
          .slice(0, 5);

        for (const slab of slabsToParse) {
          slabJobs.push({ pubkey: slab.pubkey, programId: program.programId, network: program.network });
        }
      } else {
        unparsedAccountCount += program.accountCount;
      }
    }

    // Parse all slabs in parallel batches of 5 (with hints to skip resolution)
    // Collect raw TVL entries for batch mint resolution after
    const rawTvlEntries: { mint: string; network: string; amount: number }[] = [];

    for (let i = 0; i < slabJobs.length; i += 5) {
      const batch = slabJobs.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(job =>
          getSlabMarketData(job.pubkey, { programId: job.programId, network: job.network })
        ),
      );

      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        const detail = result.value;
        parsedAccountCount += detail.positions.length;

        for (const pos of detail.positions) {
          if (pos.side === 'long') activeLongs++;
          else if (pos.side === 'short') activeShorts++;
          else flatAccounts++;

          // Collect unique wallet owners
          if (pos.owner && pos.owner !== SYSTEM_PROGRAM && pos.owner !== ZERO_ADDRESS && !pos.owner.startsWith('1111111')) {
            uniqueOwners.add(pos.owner);
          }
        }

        rawTvlEntries.push({
          mint: detail.config.collateralMint,
          network: detail.network,
          amount: detail.vaultBalanceSol,
        });
      }
    }

    // Batch-resolve collateral mint symbols from Metaplex metadata
    const devnetMints = [...new Set(rawTvlEntries.filter(e => e.network === 'devnet').map(e => e.mint))];
    const mainnetMints = [...new Set(rawTvlEntries.filter(e => e.network === 'mainnet').map(e => e.mint))];

    const [devnetSymbols, mainnetSymbols] = await Promise.all([
      devnetMints.length > 0
        ? resolveMintSymbolsBatch(devnetMints, getNetworkConnection('devnet'))
        : Promise.resolve(new Map<string, string>()),
      mainnetMints.length > 0
        ? resolveMintSymbolsBatch(mainnetMints, getNetworkConnection('mainnet'))
        : Promise.resolve(new Map<string, string>()),
    ]);

    // Build TVL by token using resolved symbols
    const tvlByToken: Record<string, { amount: number; network: string }> = {};
    for (const entry of rawTvlEntries) {
      const symbolMap = entry.network === 'devnet' ? devnetSymbols : mainnetSymbols;
      const mintSymbol = symbolMap.get(entry.mint) ?? entry.mint.slice(0, 6) + '...';
      const key = `${mintSymbol}_${entry.network}`;
      if (!tvlByToken[key]) {
        tvlByToken[key] = { amount: 0, network: entry.network };
      }
      tvlByToken[key].amount += entry.amount;
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
      uniqueWallets: uniqueOwners.size,
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
