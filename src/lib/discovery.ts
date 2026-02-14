/**
 * Slab auto-discovery — finds ALL active Percolator slabs on devnet.
 * Returns all slabs sorted by numUsedAccounts desc for consistent labeling.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { CONFIG } from './constants';
import { getCached, setCache } from './connection';

const DISCOVERY_CACHE_KEY = 'discovered_slabs';
const DISCOVERY_CACHE_MS = 60_000; // Re-discover every 60s

export interface DiscoveredSlab {
  pubkey: PublicKey;
  label: string;  // e.g. "slab-0", "slab-1"
  numUsedAccounts: number;
  lastCrankSlot: bigint;
  vaultPubkey: PublicKey;
}

/**
 * Discover ALL active Percolator slabs.
 * Returns slabs with numUsedAccounts > 0, sorted by most accounts first.
 */
export async function discoverAllSlabs(connection: Connection): Promise<DiscoveredSlab[]> {
  // Check cache first
  const cached = getCached<DiscoveredSlab[]>(DISCOVERY_CACHE_KEY, DISCOVERY_CACHE_MS);
  if (cached) return cached;

  try {
    // Fetch all 992560-byte program accounts (slab size)
    const accounts = await connection.getProgramAccounts(CONFIG.PROGRAM_ID, {
      filters: [
        { dataSize: 992560 },
      ],
      dataSlice: {
        offset: 0,
        // Need up to offset 1314 for numUsedAccounts
        length: 1314,
      },
    });

    if (accounts.length === 0) {
      console.warn('No Percolator slabs found');
      return [];
    }

    // Parse and filter active slabs
    const candidates: DiscoveredSlab[] = [];
    for (const { pubkey, account } of accounts) {
      const data = Buffer.from(account.data);
      if (data.length < 1314) continue;

      // Validate magic
      const magic = data.readBigUInt64LE(0);
      if (magic !== 0x504552434f4c4154n) continue;

      const numUsedAccounts = data.readUInt16LE(1312);
      if (numUsedAccounts === 0) continue; // Skip empty slabs

      const lastCrankSlot = data.readBigUInt64LE(624);

      // Vault pubkey from config (at offset 104)
      const vaultPubkey = new PublicKey(data.subarray(104, 136));

      candidates.push({
        pubkey,
        label: '',
        numUsedAccounts,
        lastCrankSlot,
        vaultPubkey,
      });
    }

    // Sort by numUsedAccounts desc, then lastCrankSlot desc
    candidates.sort((a, b) => {
      if (b.numUsedAccounts !== a.numUsedAccounts) {
        return b.numUsedAccounts - a.numUsedAccounts;
      }
      return Number(b.lastCrankSlot - a.lastCrankSlot);
    });

    // Assign labels
    for (let i = 0; i < candidates.length; i++) {
      candidates[i].label = `slab-${i}`;
    }

    console.log(`Discovered ${candidates.length} active slabs (total ${candidates.reduce((s, c) => s + c.numUsedAccounts, 0)} accounts)`);

    setCache(DISCOVERY_CACHE_KEY, candidates);
    return candidates;
  } catch (error) {
    console.error('Slab discovery failed:', error);
    return [];
  }
}
