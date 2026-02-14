/**
 * Shared data fetcher — fetches and caches slab data with auto-discovery.
 * All API routes call getMarketData() to get a consistent snapshot.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { CONFIG, CACHE_DURATIONS } from './constants';
import { getConnection, getCached, setCache } from './connection';
import { fetchSlab, parseConfig, parseParams, parseEngine, parseAllAccounts, calculateFundingRate } from './percolator';
import { getOraclePrice, OraclePrice } from './oracle';
import { discoverActiveSlab, DiscoveredSlab } from './discovery';
import { MarketConfig, RiskParams, EngineState, Account } from './types';

export interface MarketData {
  slabData: Buffer;
  slabPubkey: PublicKey;
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

const CACHE_KEY = 'marketData';

/**
 * Fetch all market data — slab, oracle, vault — in one call.
 * Uses discovery to find the active slab if the hardcoded one is gone.
 */
export async function getMarketData(): Promise<MarketData> {
  // Check cache
  const cached = getCached<MarketData>(CACHE_KEY, CACHE_DURATIONS.SLAB);
  if (cached) return cached;

  const connection = getConnection();

  // Step 1: Discover the active slab
  let slabPubkey: PublicKey = CONFIG.SLAB;
  let vaultPubkey: PublicKey = CONFIG.VAULT;
  let discovered: DiscoveredSlab | null = null;

  try {
    discovered = await discoverActiveSlab(connection);
    if (discovered) {
      slabPubkey = discovered.pubkey;
      vaultPubkey = discovered.vaultPubkey;
      console.log(`Using discovered slab: ${slabPubkey.toBase58()}`);
    } else {
      console.warn('Discovery returned no slabs, trying hardcoded slab');
    }
  } catch (e) {
    console.warn('Discovery failed, trying hardcoded slab:', e);
  }

  // Step 2: Fetch slab + oracle + vault + slot in parallel
  const [slabData, oracleData, vaultBalance, slot] = await Promise.all([
    fetchSlab(connection, slabPubkey),
    getOraclePrice(connection).catch(() => null),
    connection.getTokenAccountBalance(vaultPubkey).catch(() => null),
    connection.getSlot().catch(() => 0),
  ]);

  // Step 3: Parse slab
  const config = parseConfig(slabData);
  const params = parseParams(slabData);
  const engine = parseEngine(slabData);
  const allAccounts = parseAllAccounts(slabData);

  // Step 4: Oracle price — prefer live Chainlink, fall back to slab's lastEffectivePriceE6
  let oraclePriceE6: bigint;
  let solUsdPrice: number;

  if (oracleData) {
    oraclePriceE6 = oracleData.invertedPriceE6;
    solUsdPrice = oracleData.solUsdPrice;
  } else {
    oraclePriceE6 = config.lastEffectivePriceE6;
    solUsdPrice = oraclePriceE6 > 0n ? 1_000_000 / Number(oraclePriceE6) : 0;
  }

  // Step 5: Vault balance
  const vaultBalanceSol = vaultBalance
    ? Number(vaultBalance.value.amount) / 1e9
    : Number(engine.vault) / 1e9;

  const data: MarketData = {
    slabData,
    slabPubkey,
    config,
    params,
    engine,
    allAccounts,
    oraclePrice: oracleData,
    oraclePriceE6,
    solUsdPrice,
    slot,
    vaultBalanceSol,
  };

  setCache(CACHE_KEY, data);
  return data;
}
