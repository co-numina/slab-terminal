/**
 * GET /api/top-markets?limit=10&sort=tvl
 *
 * Returns enriched data for the top N slabs across all programs.
 * Sorts by numUsedAccounts from radar headers, then does batch slab
 * parsing to get TVL, OI, positions, price, health.
 *
 * Performance: uses getMultipleAccountsInfo() + batch vault balance
 * fetches instead of per-slab getAccountInfo() calls. Reuses radar
 * slots instead of fetching getSlot() per slab.
 * Runs mint resolution + DexScreener in parallel with slab fetches.
 *
 * Enrichment:
 *   - Mint symbols via Jupiter + Metaplex
 *   - USD prices via DexScreener
 *   - Oracle mode detection (admin / pyth / dex)
 *   - Insurance fund + lifetime liquidation stats
 *
 * Cache: 60s
 */
import { PublicKey } from '@solana/web3.js';
import { NextResponse } from 'next/server';
import { getCached, setCache } from '@/lib/connection';
import { scanEcosystem } from '@/lib/radar';
import { batchFetchAccounts, batchFetchVaultBalances } from '@/lib/fetcher';
import { parseConfig, parseParams, parseEngine, parseAllAccounts, calculateFundingRate, computeMarginMetrics } from '@/lib/percolator';
import { getEffectiveOraclePrice } from '@/lib/oracle';
import { resolveMintSymbol, resolveMintSymbolsBatch } from '@/lib/known-mints';
import { getNetworkConnection } from '@/lib/connections';
import { fetchTokenPricesBatch } from '@/lib/dexscreener';
import type { NetworkId } from '@/lib/registry';
import { AccountKind } from '@/lib/types';

const CACHE_KEY = 'top_markets_response';
const CACHE_MS = 60_000;
const DEFAULT_LIMIT = 15;

type OracleMode = 'admin' | 'pyth' | 'dex-pumpswap' | 'dex-raydium' | 'dex-meteora' | 'unknown';

/**
 * Detect oracle mode from the slab's indexFeedId.
 */
function detectOracleMode(indexFeedId: string): OracleMode {
  if (
    indexFeedId === '11111111111111111111111111111111' ||
    indexFeedId === 'So11111111111111111111111111111111111111111' ||
    /^1+$/.test(indexFeedId)
  ) {
    return 'admin';
  }
  return 'pyth';
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
    ratio: number;
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

// Slab info extracted from radar (lightweight, no RPC needed)
interface TopSlabInfo {
  pubkey: string;
  programId: string;
  programLabel: string;
  network: NetworkId;
  accounts: number;
  crankAge: number;
  vaultPubkey: string;
  collateralMint: string;
  slabSize: number;
}

/**
 * Parse a full slab buffer into a MarketEntry.
 * Pure CPU operation — no RPC calls.
 */
function parseSlabToMarket(
  slabData: Buffer,
  info: TopSlabInfo,
  vaultBalance: number,
): MarketEntry | null {
  try {
    const config = parseConfig(slabData);
    const params = parseParams(slabData);
    const engine = parseEngine(slabData);
    const allAccounts = parseAllAccounts(slabData);

    // Oracle price from slab's last effective price
    let oraclePriceE6: bigint;
    let solUsdPrice: number;
    if (config.lastEffectivePriceE6 > 0n) {
      oraclePriceE6 = config.lastEffectivePriceE6;
      solUsdPrice = getEffectiveOraclePrice(config.lastEffectivePriceE6, config.invert);
    } else {
      oraclePriceE6 = 0n;
      solUsdPrice = 0;
    }

    // Funding rate
    const fundingRate = calculateFundingRate(engine, config, oraclePriceE6);

    // Open interest
    const oi = oraclePriceE6 > 0n
      ? Number(engine.totalOpenInterest * oraclePriceE6 / 1_000_000n) / 1e9
      : 0;

    // Max account capacity
    const ENGINE_OFF = 392;
    const ENGINE_ACCOUNTS_OFF = 9136;
    const ACCOUNT_SIZE = 240;
    const accountsEnd = slabData.length - ENGINE_OFF - ENGINE_ACCOUNTS_OFF;
    const maxAccountCapacity = accountsEnd > 0 ? Math.floor(accountsEnd / ACCOUNT_SIZE) : 0;

    // Position breakdown
    let longsCount = 0;
    let shortsCount = 0;
    let flatCount = 0;
    let worstHealth = 100;

    for (const { account } of allAccounts) {
      const isLP = account.kind === AccountKind.LP;
      if (account.positionSize === 0n) {
        flatCount++;
      } else if (account.positionSize > 0n) {
        if (!isLP) shortsCount++; // inverted market
      } else {
        if (!isLP) longsCount++;
      }

      // Compute margin health
      const metrics = computeMarginMetrics(account, oraclePriceE6, params);
      if (metrics.health < worstHealth) {
        worstHealth = metrics.health;
      }
    }

    const activePositions = longsCount + shortsCount;

    // Insurance metrics
    const insuranceBalance = Number(engine.insuranceFund.balance) / 1e9;
    const insuranceFeeRevenue = Number(engine.insuranceFund.feeRevenue) / 1e9;
    const insuranceRatio = oi > 0 ? insuranceBalance / oi : 0;
    const insuranceHealth: 'healthy' | 'caution' | 'warning' =
      insuranceRatio < 0.02 ? 'warning' : insuranceRatio < 0.05 ? 'caution' : 'healthy';

    // Oracle mode
    const oracleMode = detectOracleMode(config.indexFeedId.toBase58());

    return {
      slabAddress: info.pubkey,
      program: info.programLabel,
      programId: info.programId,
      network: info.network,
      collateralMint: config.collateralMint.toBase58(),
      collateralSymbol: resolveMintSymbol(config.collateralMint.toBase58()),
      price: solUsdPrice,
      priceUsd: 0,
      tvl: vaultBalance,
      tvlUsd: 0,
      openInterest: oi,
      openInterestUsd: 0,
      positions: {
        longs: longsCount,
        shorts: shortsCount,
        flat: flatCount,
        total: allAccounts.length,
        active: activePositions,
      },
      worstHealth,
      fundingRate: fundingRate.rateBpsPerHour,
      fundingDirection: fundingRate.direction,
      lastCrankAge: info.crankAge,
      status: info.crankAge < 3600 ? 'active' : info.crankAge < 86400 ? 'stale' : 'idle',
      oracleMode,
      insurance: {
        balance: insuranceBalance,
        feeRevenue: insuranceFeeRevenue,
        ratio: insuranceRatio,
        health: insuranceHealth,
      },
      lifetimeLiquidations: Number(engine.lifetimeLiquidations),
      lifetimeForceCloses: Number(engine.lifetimeForceCloses),
      config: {
        invert: config.invert,
        maintMarginBps: Number(params.maintenanceMarginBps),
        initMarginBps: Number(params.initialMarginBps),
        tradingFeeBps: Number(params.tradingFeeBps),
        maxAccounts: maxAccountCapacity,
        usedAccounts: engine.numUsedAccounts,
        utilization: maxAccountCapacity > 0
          ? (engine.numUsedAccounts / maxAccountCapacity) * 100
          : 0,
      },
      slabSize: slabData.length,
    };
  } catch (err) {
    console.warn(`[top-markets] Failed to parse slab ${info.pubkey}:`, err);
    return null;
  }
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

    // Flatten all slabs with full context from radar (including vault pubkeys + mints)
    const allSlabs: TopSlabInfo[] = [];

    for (const program of radar.programs) {
      for (const slab of program.slabs) {
        if (slab.numUsedAccounts > 0) {
          allSlabs.push({
            pubkey: slab.pubkey,
            programId: program.programId,
            programLabel: program.label,
            network: program.network,
            accounts: slab.numUsedAccounts,
            crankAge: slab.lastCrankAge,
            vaultPubkey: slab.vaultPubkey,
            collateralMint: slab.collateralMint,
            slabSize: slab.slabSize,
          });
        }
      }
    }

    // Sort by account count desc (proxy for activity/importance)
    allSlabs.sort((a, b) => b.accounts - a.accounts);

    // Take top N
    const topSlabs = allSlabs.slice(0, limit);

    if (topSlabs.length === 0) {
      const response = {
        markets: [],
        count: 0,
        totalCandidates: 0,
        generatedAt: new Date().toISOString(),
      };
      setCache(CACHE_KEY, response);
      return NextResponse.json(response, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
      });
    }

    // ── BATCH FETCH: all RPC + external API calls in parallel ──────────

    // Group slabs by network for batch RPC calls
    const devnetSlabs = topSlabs.filter(s => s.network === 'devnet');
    const mainnetSlabs = topSlabs.filter(s => s.network === 'mainnet');
    const devnetConn = getNetworkConnection('devnet');
    const mainnetConn = getNetworkConnection('mainnet');

    // Collect all collateral mints (from radar discovery — no RPC needed)
    const allMints = [...new Set(topSlabs.map(s => s.collateralMint).filter(Boolean))];
    const devnetMints = [...new Set(devnetSlabs.map(s => s.collateralMint).filter(Boolean))];
    const mainnetMints = [...new Set(mainnetSlabs.map(s => s.collateralMint).filter(Boolean))];

    // Fire ALL async operations in parallel:
    // 1. Batch fetch slab account data (getMultipleAccountsInfo — 1-2 RPC calls)
    // 2. Batch fetch vault balances (parallel getTokenAccountBalance — grouped)
    // 3. Resolve mint symbols (Jupiter + Metaplex)
    // 4. Fetch DexScreener USD prices
    const [
      devnetSlabData,
      mainnetSlabData,
      devnetVaults,
      mainnetVaults,
      devnetSymbols,
      mainnetSymbols,
      tokenPrices,
    ] = await Promise.all([
      // Slab account data
      devnetSlabs.length > 0
        ? batchFetchAccounts(devnetConn, devnetSlabs.map(s => new PublicKey(s.pubkey)), 10)
        : Promise.resolve([] as (Buffer | null)[]),
      mainnetSlabs.length > 0
        ? batchFetchAccounts(mainnetConn, mainnetSlabs.map(s => new PublicKey(s.pubkey)), 10)
        : Promise.resolve([] as (Buffer | null)[]),
      // Vault balances
      devnetSlabs.length > 0
        ? batchFetchVaultBalances(devnetConn, devnetSlabs.map(s => new PublicKey(s.vaultPubkey)), 10)
        : Promise.resolve([] as (number | null)[]),
      mainnetSlabs.length > 0
        ? batchFetchVaultBalances(mainnetConn, mainnetSlabs.map(s => new PublicKey(s.vaultPubkey)), 10)
        : Promise.resolve([] as (number | null)[]),
      // Mint symbols
      devnetMints.length > 0
        ? resolveMintSymbolsBatch(devnetMints, devnetConn)
        : Promise.resolve(new Map<string, string>()),
      mainnetMints.length > 0
        ? resolveMintSymbolsBatch(mainnetMints, mainnetConn)
        : Promise.resolve(new Map<string, string>()),
      // DexScreener USD prices
      fetchTokenPricesBatch(allMints),
    ]);

    // ── PARSE: all CPU, no RPC ──────────────────────────────────────────

    const markets: MarketEntry[] = [];

    // Parse devnet slabs
    for (let i = 0; i < devnetSlabs.length; i++) {
      const slabData = devnetSlabData[i];
      if (!slabData) continue;
      const vaultBalance = devnetVaults[i] ?? 0;
      const entry = parseSlabToMarket(slabData, devnetSlabs[i], vaultBalance);
      if (entry) markets.push(entry);
    }

    // Parse mainnet slabs
    for (let i = 0; i < mainnetSlabs.length; i++) {
      const slabData = mainnetSlabData[i];
      if (!slabData) continue;
      const vaultBalance = mainnetVaults[i] ?? 0;
      const entry = parseSlabToMarket(slabData, mainnetSlabs[i], vaultBalance);
      if (entry) markets.push(entry);
    }

    // ── ENRICH: apply resolved symbols + USD prices ─────────────────────

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
