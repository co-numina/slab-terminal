/**
 * GET /api/ecosystem — Aggregated ecosystem stats for HOME view.
 *
 * Uses radar data (header-level) + batch RPC for position breakdowns.
 * Programs tagged in PARSE_PROGRAMS get full slab fetch + CPU parse.
 * Others get header-level stats only.
 *
 * Performance: single batch getMultipleAccountsInfo + batch vault
 * balances + batch mint resolution — all in parallel. No per-slab
 * getSlabMarketData() calls.
 *
 * Cache: 30s
 */
import { PublicKey } from '@solana/web3.js';
import { NextResponse } from 'next/server';
import { getCached, setCache } from '@/lib/connection';
import { scanEcosystem } from '@/lib/radar';
import { batchFetchAccounts, batchFetchVaultBalances } from '@/lib/fetcher';
import { parseConfig, parseAllAccounts } from '@/lib/percolator';
import { resolveMintSymbolsBatch } from '@/lib/known-mints';
import { getNetworkConnection } from '@/lib/connections';
import { AccountKind } from '@/lib/types';

const CACHE_KEY = 'ecosystem_response';
const CACHE_MS = 30_000;

// Programs small enough to do full position parsing
const PARSE_PROGRAMS = new Set(['toly-original', 'sov-mainnet', 'launch-large']);

interface SlabParseJob {
  pubkey: string;
  programId: string;
  network: 'devnet' | 'mainnet';
  vaultPubkey: string;
  collateralMint: string;
}

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

    // Collect slab parse jobs from programs we want full position data for
    const slabJobs: SlabParseJob[] = [];
    let unparsedAccountCount = 0;

    for (const program of radar.programs) {
      if (PARSE_PROGRAMS.has(program.id) && program.slabs.length > 0) {
        const slabsToParse = program.slabs
          .filter(s => s.numUsedAccounts > 0)
          .slice(0, 5);

        for (const slab of slabsToParse) {
          slabJobs.push({
            pubkey: slab.pubkey,
            programId: program.programId,
            network: program.network,
            vaultPubkey: slab.vaultPubkey,
            collateralMint: slab.collateralMint,
          });
        }
      } else {
        unparsedAccountCount += program.accountCount;
      }
    }

    // ── BATCH FETCH: all RPC + mint resolution in parallel ─────────────

    const devnetJobs = slabJobs.filter(j => j.network === 'devnet');
    const mainnetJobs = slabJobs.filter(j => j.network === 'mainnet');
    const devnetConn = getNetworkConnection('devnet');
    const mainnetConn = getNetworkConnection('mainnet');

    // Collect all collateral mints from radar data (no RPC needed)
    const allDevnetMints = [...new Set(devnetJobs.map(j => j.collateralMint).filter(Boolean))];
    const allMainnetMints = [...new Set(mainnetJobs.map(j => j.collateralMint).filter(Boolean))];

    const [
      devnetSlabData,
      mainnetSlabData,
      devnetVaults,
      mainnetVaults,
      devnetSymbols,
      mainnetSymbols,
    ] = await Promise.all([
      // Slab account data — batch getMultipleAccountsInfo
      devnetJobs.length > 0
        ? batchFetchAccounts(devnetConn, devnetJobs.map(j => new PublicKey(j.pubkey)), 10)
        : Promise.resolve([] as (Buffer | null)[]),
      mainnetJobs.length > 0
        ? batchFetchAccounts(mainnetConn, mainnetJobs.map(j => new PublicKey(j.pubkey)), 10)
        : Promise.resolve([] as (Buffer | null)[]),
      // Vault balances — parallel getTokenAccountBalance
      devnetJobs.length > 0
        ? batchFetchVaultBalances(devnetConn, devnetJobs.map(j => new PublicKey(j.vaultPubkey)), 10)
        : Promise.resolve([] as (number | null)[]),
      mainnetJobs.length > 0
        ? batchFetchVaultBalances(mainnetConn, mainnetJobs.map(j => new PublicKey(j.vaultPubkey)), 10)
        : Promise.resolve([] as (number | null)[]),
      // Mint symbols — Jupiter + Metaplex
      allDevnetMints.length > 0
        ? resolveMintSymbolsBatch(allDevnetMints, devnetConn)
        : Promise.resolve(new Map<string, string>()),
      allMainnetMints.length > 0
        ? resolveMintSymbolsBatch(allMainnetMints, mainnetConn)
        : Promise.resolve(new Map<string, string>()),
    ]);

    // ── PARSE: all CPU, no RPC ──────────────────────────────────────────

    let activeLongs = 0;
    let activeShorts = 0;
    let flatAccounts = 0;
    let parsedAccountCount = 0;

    const uniqueOwners = new Set<string>();
    const SYSTEM_PROGRAM = '11111111111111111111111111111111';
    const ZERO_ADDRESS = '11111111111111111111111111111111111111111111';

    const rawTvlEntries: { mint: string; network: string; amount: number }[] = [];

    // Helper to process a batch of slabs from one network
    function processSlabBatch(
      jobs: SlabParseJob[],
      slabDataArr: (Buffer | null)[],
      vaultBalances: (number | null)[],
    ) {
      for (let i = 0; i < jobs.length; i++) {
        const data = slabDataArr[i];
        if (!data) continue;

        try {
          const config = parseConfig(data);
          const allAccounts = parseAllAccounts(data);

          parsedAccountCount += allAccounts.length;

          for (const { account } of allAccounts) {
            const isLP = account.kind === AccountKind.LP;

            if (account.positionSize === 0n) {
              flatAccounts++;
            } else if (account.positionSize > 0n) {
              if (!isLP) activeShorts++; // inverted market
            } else {
              if (!isLP) activeLongs++;
            }

            // Collect unique wallet owners
            const ownerStr = account.owner.toBase58();
            if (ownerStr !== SYSTEM_PROGRAM && ownerStr !== ZERO_ADDRESS && !ownerStr.startsWith('1111111')) {
              uniqueOwners.add(ownerStr);
            }
          }

          rawTvlEntries.push({
            mint: config.collateralMint.toBase58(),
            network: jobs[i].network,
            amount: vaultBalances[i] ?? 0,
          });
        } catch (err) {
          console.warn(`[ecosystem] Failed to parse slab ${jobs[i].pubkey}:`, err);
        }
      }
    }

    processSlabBatch(devnetJobs, devnetSlabData, devnetVaults);
    processSlabBatch(mainnetJobs, mainnetSlabData, mainnetVaults);

    // ── ENRICH: apply resolved symbols ──────────────────────────────────

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
