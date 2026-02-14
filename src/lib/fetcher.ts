/**
 * Shared data fetcher — fetches and caches slab data with auto-discovery.
 * getAllMarketData() fetches ALL active slabs using batched RPC calls.
 * getSlabMarketData() fetches a single slab from any network for drill-down.
 */
import { PublicKey, type Connection } from '@solana/web3.js';
import { CACHE_DURATIONS } from './constants';
import { getConnection, getCached, setCache } from './connection';
import { parseHeader, parseConfig, parseParams, parseEngine, parseAllAccounts, calculateFundingRate, computeMarginMetrics, estimateLiquidationPrice } from './percolator';
import { getOraclePrice, getEffectiveOraclePrice, OraclePrice } from './oracle';
import { discoverAllSlabs, DiscoveredSlab } from './discovery';
import { getNetworkConnection } from './connections';
import { PROGRAM_REGISTRY, type NetworkId } from './registry';
import { MarketConfig, RiskParams, EngineState, Account, AccountKind } from './types';

export interface MarketData {
  slabData: Buffer;
  slabPubkey: PublicKey;
  slabLabel: string;
  config: MarketConfig;
  params: RiskParams;
  engine: EngineState;
  allAccounts: { idx: number; account: Account }[];
  oraclePrice: OraclePrice | null;
  oraclePriceE6: bigint;
  solUsdPrice: number;
  slot: number;
  vaultBalanceSol: number;
}

export interface AllMarketData {
  slabs: MarketData[];
  oraclePrice: OraclePrice | null;
  oraclePriceE6: bigint;
  solUsdPrice: number;
  slot: number;
}

const ALL_CACHE_KEY = 'allMarketData';

/**
 * Batch-fetch multiple accounts using getMultipleAccounts.
 * Solana RPC supports up to 100 accounts per call.
 * Returns results in same order as input pubkeys (null for failures).
 */
async function batchFetchAccounts(
  connection: Connection,
  pubkeys: PublicKey[],
  batchSize = 10,
): Promise<(Buffer | null)[]> {
  const results: (Buffer | null)[] = new Array(pubkeys.length).fill(null);

  for (let i = 0; i < pubkeys.length; i += batchSize) {
    const batch = pubkeys.slice(i, i + batchSize);
    try {
      const infos = await connection.getMultipleAccountsInfo(batch);
      for (let j = 0; j < infos.length; j++) {
        if (infos[j]) {
          results[i + j] = Buffer.from(infos[j]!.data);
        }
      }
    } catch (err) {
      console.warn(`Batch fetch failed at offset ${i}: ${err}`);
      // Fall back to individual fetches for this batch
      for (let j = 0; j < batch.length; j++) {
        try {
          const info = await connection.getAccountInfo(batch[j]);
          if (info) results[i + j] = Buffer.from(info.data);
        } catch {
          // Individual fetch also failed, leave as null
        }
      }
    }
  }

  return results;
}

/**
 * Batch-fetch token account balances in sequential groups to avoid rate limiting.
 */
async function batchFetchVaultBalances(
  connection: Connection,
  vaultPubkeys: PublicKey[],
  batchSize = 5,
): Promise<(number | null)[]> {
  const results: (number | null)[] = new Array(vaultPubkeys.length).fill(null);

  for (let i = 0; i < vaultPubkeys.length; i += batchSize) {
    const batch = vaultPubkeys.slice(i, i + batchSize);
    const promises = batch.map((pk, j) =>
      connection.getTokenAccountBalance(pk)
        .then(bal => { results[i + j] = Number(bal.value.amount) / 1e9; })
        .catch(() => { /* leave as null */ })
    );
    await Promise.all(promises);
  }

  return results;
}

/**
 * Fetch market data for ALL active slabs using batched RPC calls.
 * Oracle and slot are fetched once and shared.
 */
export async function getAllMarketData(): Promise<AllMarketData> {
  // Check cache
  const cached = getCached<AllMarketData>(ALL_CACHE_KEY, CACHE_DURATIONS.SLAB);
  if (cached) return cached;

  const connection = getConnection();

  // Step 1: Discover all active slabs
  const discovered = await discoverAllSlabs(connection);
  if (discovered.length === 0) {
    throw new Error('No active Percolator slabs found on devnet');
  }

  // Step 2: Fetch oracle + slot (shared, once)
  const [oracleData, slot] = await Promise.all([
    getOraclePrice(connection).catch(() => null),
    connection.getSlot().catch(() => 0),
  ]);

  // Step 3: Batch-fetch all slab account data (using getMultipleAccounts)
  const slabPubkeys = discovered.map(d => d.pubkey);
  const slabBuffers = await batchFetchAccounts(connection, slabPubkeys, 10);

  // Step 4: Batch-fetch all vault balances (sequential groups of 5)
  const vaultPubkeys = discovered.map(d => d.vaultPubkey);
  const vaultBalances = await batchFetchVaultBalances(connection, vaultPubkeys, 5);

  // Step 5: Parse all slab data
  const slabs: MarketData[] = [];

  // Compute oracle values once
  let oraclePriceE6: bigint;
  let solUsdPrice: number;

  for (let i = 0; i < discovered.length; i++) {
    const disc = discovered[i];
    const slabData = slabBuffers[i];
    if (!slabData) {
      console.warn(`Slab ${disc.pubkey.toBase58()} fetch returned null — skipping`);
      continue;
    }

    try {
      const config = parseConfig(slabData);
      const params = parseParams(slabData);
      const engine = parseEngine(slabData);
      const allAccounts = parseAllAccounts(slabData);

      // Oracle price (same for all slabs)
      let slabOraclePriceE6: bigint;
      let slabSolUsdPrice: number;
      if (oracleData) {
        slabOraclePriceE6 = oracleData.invertedPriceE6;
        slabSolUsdPrice = oracleData.solUsdPrice;
      } else {
        slabOraclePriceE6 = config.lastEffectivePriceE6;
        slabSolUsdPrice = slabOraclePriceE6 > 0n ? 1_000_000 / Number(slabOraclePriceE6) : 0;
      }

      // Vault balance from token account (not engine.vault which is internal accounting)
      const vaultBalanceSol = vaultBalances[i] ?? 0;

      slabs.push({
        slabData,
        slabPubkey: disc.pubkey,
        slabLabel: disc.label,
        config,
        params,
        engine,
        allAccounts,
        oraclePrice: oracleData,
        oraclePriceE6: slabOraclePriceE6,
        solUsdPrice: slabSolUsdPrice,
        slot,
        vaultBalanceSol,
      });
    } catch (err) {
      console.warn(`Failed to parse slab ${disc.pubkey.toBase58()}: ${err}`);
    }
  }

  // Use shared oracle from first slab (or from oracle data directly)
  if (oracleData) {
    oraclePriceE6 = oracleData.invertedPriceE6;
    solUsdPrice = oracleData.solUsdPrice;
  } else {
    const firstSlab = slabs[0];
    oraclePriceE6 = firstSlab?.oraclePriceE6 ?? 0n;
    solUsdPrice = firstSlab?.solUsdPrice ?? 0;
  }

  const data: AllMarketData = {
    slabs,
    oraclePrice: oracleData,
    oraclePriceE6,
    solUsdPrice,
    slot,
  };

  setCache(ALL_CACHE_KEY, data);
  return data;
}

/**
 * Backward-compatible: get market data for the best (first) slab.
 */
export async function getMarketData(): Promise<MarketData> {
  const all = await getAllMarketData();
  if (all.slabs.length === 0) {
    throw new Error('No active slabs available');
  }
  return all.slabs[0];
}

// ============================================================================
// Single-slab fetcher — program-agnostic drill-down
// ============================================================================

export interface SlabDetail {
  slabPubkey: string;
  programId: string;
  programLabel: string;
  network: NetworkId;
  slabSize: number;

  // Parsed state
  header: {
    version: number;
    bump: number;
    flags: number;
    resolved: boolean;
    admin: string;
  };
  config: {
    collateralMint: string;
    vaultPubkey: string;
    indexFeedId: string;
    invert: number;
    unitScale: number;
    maxStalenessSlots: string;
    confFilterBps: number;
    fundingHorizonSlots: string;
    fundingKBps: string;
    fundingMaxPremiumBps: string;
    fundingMaxBpsPerSlot: string;
    oracleAuthority: string;
    lastEffectivePriceE6: string;
  };
  engine: {
    vault: string;
    insuranceFundBalance: string;
    insuranceFeeRevenue: string;
    totalOpenInterest: string;
    netLpPos: string;
    lpSumAbs: string;
    numUsedAccounts: number;
    nextAccountId: string;
    lastCrankSlot: number;
    lastFundingSlot: string;
    fundingRateBpsPerSlotLast: string;
    fundingIndexQpbE6: string;
    lifetimeLiquidations: number;
    lifetimeForceCloses: number;
    liqCursor: number;
    gcCursor: number;
    crankCursor: number;
  };
  params: {
    maintenanceMarginBps: number;
    initialMarginBps: number;
    tradingFeeBps: number;
    liquidationFeeBps: number;
    maxAccounts: number;
    warmupPeriodSlots: string;
    maxCrankStalenessSlots: string;
  };

  // Market metrics
  oraclePriceE6: string;
  solUsdPrice: number;
  invertedMarket: boolean;
  maxAccountCapacity: number;

  // Funding
  fundingRate: {
    rateBpsPerSlot: number;
    rateBpsPerHour: number;
    direction: 'longs_pay' | 'shorts_pay' | 'neutral';
  };

  // TVL
  vaultBalanceSol: number;
  tvlUsd: number;
  insuranceFundSol: number;
  openInterestSol: number;

  // Positions
  positions: SlabPosition[];
  lps: SlabLP[];

  // Summary
  summary: {
    totalPositions: number;
    totalLPs: number;
    totalLongs: number;
    totalShorts: number;
    totalLongNotional: number;
    totalShortNotional: number;
    liquidatable: number;
    atRisk: number;
  };

  slot: number;
  timestamp: string;
}

export interface SlabPosition {
  accountIndex: number;
  accountId: string;
  owner: string;
  side: 'long' | 'short' | 'flat';
  size: number;
  rawSize: string;
  entryPrice: number;
  entryPriceE6: string;
  markPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  unrealizedPnlPercent: number;
  collateral: number;
  effectiveCapital: number;
  marginHealth: number;
  marginRatioBps: number;
  liquidationPrice: number;
  isLP: boolean;
  status: 'safe' | 'at_risk' | 'liquidatable';
}

export interface SlabLP {
  accountIndex: number;
  accountId: string;
  owner: string;
  collateral: number;
  pnl: number;
  effectiveCapital: number;
  positionSize: string;
  positionNotional: number;
  matcherProgram: string;
  matcherContext: string;
}

/**
 * Detect which program owns a slab by its address.
 * Fetches the account once per network, then matches the owner against registry.
 * Returns { programEntry, network, connection } or null.
 */
async function resolveSlabProgram(slabAddress: string): Promise<{
  entry: (typeof PROGRAM_REGISTRY)[number];
  connection: Connection;
  accountData: Buffer;
} | null> {
  const pubkey = new PublicKey(slabAddress);

  // Group registry entries by network
  const networkEntries = new Map<NetworkId, (typeof PROGRAM_REGISTRY)[number][]>();
  for (const entry of PROGRAM_REGISTRY) {
    const existing = networkEntries.get(entry.network) ?? [];
    existing.push(entry);
    networkEntries.set(entry.network, existing);
  }

  // Try each network once (devnet first, most likely)
  for (const [network, entries] of networkEntries) {
    try {
      const connection = getNetworkConnection(network);
      const info = await connection.getAccountInfo(pubkey);
      if (!info) continue;

      // Match the owner against all programs on this network
      const ownerStr = info.owner.toBase58();
      const match = entries.find((e) => e.programId === ownerStr);
      if (match) {
        return {
          entry: match,
          connection,
          accountData: Buffer.from(info.data),
        };
      }
    } catch {
      // Network error, try next
    }
  }
  return null;
}

/**
 * Fetch full market data for a SINGLE slab from any program/network.
 * This is the core of the drill-down view.
 * Caches for 5s per slab address.
 */
export async function getSlabMarketData(slabAddress: string): Promise<SlabDetail> {
  const cacheKey = `slab_detail_${slabAddress}`;
  const cached = getCached<SlabDetail>(cacheKey, CACHE_DURATIONS.SLAB);
  if (cached) return cached;

  // Resolve which program/network owns this slab
  const resolved = await resolveSlabProgram(slabAddress);
  if (!resolved) {
    throw new Error(`Slab not found on any known program: ${slabAddress}`);
  }

  const { entry, connection, accountData } = resolved;
  const slabData = accountData;

  // Parse the full slab
  const header = parseHeader(slabData);
  const config = parseConfig(slabData);
  const params = parseParams(slabData);
  const engine = parseEngine(slabData);
  const allAccounts = parseAllAccounts(slabData);

  // Get slot
  const slot = await connection.getSlot('confirmed').catch(() => 0);

  // Oracle price: try the slab's effective price first
  let oraclePriceE6: bigint;
  let solUsdPrice: number;

  if (config.lastEffectivePriceE6 > 0n) {
    oraclePriceE6 = config.lastEffectivePriceE6;
    solUsdPrice = getEffectiveOraclePrice(config.lastEffectivePriceE6, config.invert);
  } else {
    oraclePriceE6 = 0n;
    solUsdPrice = 0;
  }

  // For devnet Toly, try the real oracle too
  if (entry.network === 'devnet' && entry.oracleAddress) {
    try {
      const oracleData = await getOraclePrice(connection);
      oraclePriceE6 = oracleData.invertedPriceE6;
      solUsdPrice = oracleData.solUsdPrice;
    } catch {
      // Keep effective price
    }
  }

  // Vault balance
  let vaultBalanceSol = 0;
  try {
    const vaultBal = await connection.getTokenAccountBalance(config.vaultPubkey);
    vaultBalanceSol = Number(vaultBal.value.amount) / 1e9;
  } catch {
    // Vault may not exist or be a different token
  }

  // Funding rate
  const fundingRate = calculateFundingRate(engine, config, oraclePriceE6);

  // Open interest in SOL
  const oiRaw = oraclePriceE6 > 0n
    ? Number(engine.totalOpenInterest * oraclePriceE6 / 1_000_000n) / 1e9
    : 0;

  // Max account capacity for this slab size
  const ENGINE_OFF = 392;
  const ENGINE_ACCOUNTS_OFF = 9136;
  const ACCOUNT_SIZE = 240;
  const accountsEnd = slabData.length - ENGINE_OFF - ENGINE_ACCOUNTS_OFF;
  const maxAccountCapacity = accountsEnd > 0 ? Math.floor(accountsEnd / ACCOUNT_SIZE) : 0;

  // Parse positions and LPs
  const positions: SlabPosition[] = [];
  const lps: SlabLP[] = [];

  for (const { idx, account } of allAccounts) {
    if (account.kind === AccountKind.LP) {
      const collateral = Number(account.capital) / 1e9;
      const pnl = Number(account.pnl) / 1e9;
      const absPos = account.positionSize < 0n ? -account.positionSize : account.positionSize;
      const posNotional = oraclePriceE6 > 0n
        ? Number(absPos * oraclePriceE6 / 1_000_000n) / 1e9 * solUsdPrice
        : 0;

      lps.push({
        accountIndex: idx,
        accountId: account.accountId.toString(),
        owner: account.owner.toBase58(),
        collateral,
        pnl,
        effectiveCapital: collateral + pnl,
        positionSize: account.positionSize.toString(),
        positionNotional: posNotional,
        matcherProgram: account.matcherProgram.toBase58(),
        matcherContext: account.matcherContext.toBase58(),
      });
    }

    // All accounts get position entries (including LPs)
    const metrics = computeMarginMetrics(account, oraclePriceE6, params);
    const liqPriceE6 = estimateLiquidationPrice(account, params);
    const liquidationPrice = liqPriceE6 > 0 ? 1_000_000 / liqPriceE6 : 0;
    const entryPrice = Number(account.entryPrice) > 0
      ? 1_000_000 / Number(account.entryPrice)
      : 0;
    const collateral = Number(account.capital) / 1e9;
    const unrealizedPnlSol = Number(metrics.unrealizedPnl) / 1e9;

    let side: 'long' | 'short' | 'flat';
    if (account.positionSize === 0n) side = 'flat';
    else if (account.positionSize > 0n) side = 'short'; // inverted market
    else side = 'long';

    positions.push({
      accountIndex: idx,
      accountId: account.accountId.toString(),
      owner: account.owner.toBase58(),
      side,
      size: Number(metrics.notionalLamports) / 1e9,
      rawSize: account.positionSize.toString(),
      entryPrice,
      entryPriceE6: account.entryPrice.toString(),
      markPrice: solUsdPrice,
      unrealizedPnl: unrealizedPnlSol,
      realizedPnl: Number(account.pnl) / 1e9,
      unrealizedPnlPercent: collateral > 0 ? (unrealizedPnlSol / collateral) * 100 : 0,
      collateral,
      effectiveCapital: Number(metrics.effectiveCapital) / 1e9,
      marginHealth: metrics.health,
      marginRatioBps: metrics.marginRatioBps,
      liquidationPrice,
      isLP: account.kind === AccountKind.LP,
      status: metrics.status,
    });
  }

  const longs = positions.filter(p => p.side === 'long');
  const shorts = positions.filter(p => p.side === 'short');

  const detail: SlabDetail = {
    slabPubkey: slabAddress,
    programId: entry.programId,
    programLabel: entry.label,
    network: entry.network,
    slabSize: slabData.length,

    header: {
      version: header.version,
      bump: header.bump,
      flags: header.flags,
      resolved: header.resolved,
      admin: header.admin.toBase58(),
    },
    config: {
      collateralMint: config.collateralMint.toBase58(),
      vaultPubkey: config.vaultPubkey.toBase58(),
      indexFeedId: config.indexFeedId.toBase58(),
      invert: config.invert,
      unitScale: config.unitScale,
      maxStalenessSlots: config.maxStalenessSlots.toString(),
      confFilterBps: config.confFilterBps,
      fundingHorizonSlots: config.fundingHorizonSlots.toString(),
      fundingKBps: config.fundingKBps.toString(),
      fundingMaxPremiumBps: config.fundingMaxPremiumBps.toString(),
      fundingMaxBpsPerSlot: config.fundingMaxBpsPerSlot.toString(),
      oracleAuthority: config.oracleAuthority.toBase58(),
      lastEffectivePriceE6: config.lastEffectivePriceE6.toString(),
    },
    engine: {
      vault: engine.vault.toString(),
      insuranceFundBalance: engine.insuranceFund.balance.toString(),
      insuranceFeeRevenue: engine.insuranceFund.feeRevenue.toString(),
      totalOpenInterest: engine.totalOpenInterest.toString(),
      netLpPos: engine.netLpPos.toString(),
      lpSumAbs: engine.lpSumAbs.toString(),
      numUsedAccounts: engine.numUsedAccounts,
      nextAccountId: engine.nextAccountId.toString(),
      lastCrankSlot: Number(engine.lastCrankSlot),
      lastFundingSlot: engine.lastFundingSlot.toString(),
      fundingRateBpsPerSlotLast: engine.fundingRateBpsPerSlotLast.toString(),
      fundingIndexQpbE6: engine.fundingIndexQpbE6.toString(),
      lifetimeLiquidations: Number(engine.lifetimeLiquidations),
      lifetimeForceCloses: Number(engine.lifetimeForceCloses),
      liqCursor: engine.liqCursor,
      gcCursor: engine.gcCursor,
      crankCursor: engine.crankCursor,
    },
    params: {
      maintenanceMarginBps: Number(params.maintenanceMarginBps),
      initialMarginBps: Number(params.initialMarginBps),
      tradingFeeBps: Number(params.tradingFeeBps),
      liquidationFeeBps: Number(params.liquidationFeeBps),
      maxAccounts: Number(params.maxAccounts),
      warmupPeriodSlots: params.warmupPeriodSlots.toString(),
      maxCrankStalenessSlots: params.maxCrankStalenessSlots.toString(),
    },

    oraclePriceE6: oraclePriceE6.toString(),
    solUsdPrice,
    invertedMarket: config.invert === 1,
    maxAccountCapacity,

    fundingRate,

    vaultBalanceSol,
    tvlUsd: vaultBalanceSol * solUsdPrice,
    insuranceFundSol: Number(engine.insuranceFund.balance) / 1e9,
    openInterestSol: oiRaw,

    positions,
    lps,

    summary: {
      totalPositions: positions.length,
      totalLPs: lps.length,
      totalLongs: longs.length,
      totalShorts: shorts.length,
      totalLongNotional: longs.reduce((s, p) => s + p.size, 0),
      totalShortNotional: shorts.reduce((s, p) => s + p.size, 0),
      liquidatable: positions.filter(p => p.status === 'liquidatable').length,
      atRisk: positions.filter(p => p.status === 'at_risk').length,
    },

    slot,
    timestamp: new Date().toISOString(),
  };

  setCache(cacheKey, detail);
  return detail;
}
