/**
 * Shared data fetcher — fetches and caches slab data with auto-discovery.
 * getAllMarketData() fetches ALL active slabs using batched RPC calls.
 */
import { PublicKey, type Connection } from '@solana/web3.js';
import { CACHE_DURATIONS } from './constants';
import { getConnection, getCached, setCache } from './connection';
import { parseConfig, parseParams, parseEngine, parseAllAccounts } from './percolator';
import { getOraclePrice, OraclePrice } from './oracle';
import { discoverAllSlabs, DiscoveredSlab } from './discovery';
import { MarketConfig, RiskParams, EngineState, Account } from './types';

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
