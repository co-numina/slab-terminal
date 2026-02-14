/**
 * Shared data fetcher — fetches and caches slab data with auto-discovery.
 * getAllMarketData() fetches ALL active slabs in parallel.
 */
import { PublicKey } from '@solana/web3.js';
import { CACHE_DURATIONS } from './constants';
import { getConnection, getCached, setCache } from './connection';
import { fetchSlab, parseConfig, parseParams, parseEngine, parseAllAccounts } from './percolator';
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
 * Fetch market data for ALL active slabs in parallel.
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

  // Step 3: Fetch all slab data + vault balances in parallel
  const slabResults = await Promise.all(
    discovered.map(async (disc: DiscoveredSlab) => {
      try {
        const [slabData, vaultBalance] = await Promise.all([
          fetchSlab(connection, disc.pubkey),
          connection.getTokenAccountBalance(disc.vaultPubkey).catch(() => null),
        ]);

        const config = parseConfig(slabData);
        const params = parseParams(slabData);
        const engine = parseEngine(slabData);
        const allAccounts = parseAllAccounts(slabData);

        // Oracle price
        let oraclePriceE6: bigint;
        let solUsdPrice: number;
        if (oracleData) {
          oraclePriceE6 = oracleData.invertedPriceE6;
          solUsdPrice = oracleData.solUsdPrice;
        } else {
          oraclePriceE6 = config.lastEffectivePriceE6;
          solUsdPrice = oraclePriceE6 > 0n ? 1_000_000 / Number(oraclePriceE6) : 0;
        }

        // Vault balance — only use token account balance (engine.vault is internal accounting)
        const vaultBalanceSol = vaultBalance
          ? Number(vaultBalance.value.amount) / 1e9
          : 0;

        return {
          slabData,
          slabPubkey: disc.pubkey,
          slabLabel: disc.label,
          config,
          params,
          engine,
          allAccounts,
          oraclePrice: oracleData,
          oraclePriceE6,
          solUsdPrice,
          slot,
          vaultBalanceSol,
        } as MarketData;
      } catch (err) {
        console.warn(`Failed to fetch slab ${disc.pubkey.toBase58()}: ${err}`);
        return null;
      }
    })
  );

  // Filter out failed fetches
  const slabs = slabResults.filter((s): s is MarketData => s !== null);

  // Compute shared oracle values from first successful slab
  const firstSlab = slabs[0];
  const oraclePriceE6 = firstSlab?.oraclePriceE6 ?? 0n;
  const solUsdPrice = firstSlab?.solUsdPrice ?? 0;

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
