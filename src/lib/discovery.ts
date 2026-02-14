/**
 * Slab auto-discovery — finds the most active Percolator slab on devnet.
 * Since Percolator creates/destroys slab accounts frequently on devnet,
 * we discover active slabs by querying getProgramAccounts and scoring them.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { CONFIG } from './constants';
import { getCached, setCache } from './connection';

const PERCOLAT_MAGIC = Buffer.from('PERCOLAT');
const DISCOVERY_CACHE_KEY = 'discovered_slab';
const DISCOVERY_CACHE_MS = 60_000; // Re-discover every 60s

export interface DiscoveredSlab {
  pubkey: PublicKey;
  numUsedAccounts: number;
  lastCrankSlot: bigint;
  vaultLamports: bigint;
  vaultPubkey: PublicKey;
  oracleAuthority: PublicKey;
}

/**
 * Discover the best active slab for this Percolator program.
 * Scores slabs by: numUsedAccounts * 100 + recentCrankBonus + tvlBonus
 */
export async function discoverActiveSlab(connection: Connection): Promise<DiscoveredSlab | null> {
  // Check cache first
  const cached = getCached<DiscoveredSlab>(DISCOVERY_CACHE_KEY, DISCOVERY_CACHE_MS);
  if (cached) return cached;

  try {
    // Fetch all program accounts with just enough data to evaluate them
    // We need: magic(8 bytes at 0), numUsedAccounts(2 bytes at 1312),
    //          lastCrankSlot(8 bytes at 624), vault u128(16 bytes at 392),
    //          vault_pubkey(32 bytes at 104), oracle_authority(32 bytes at 400)
    // But getProgramAccounts with dataSlice only returns one slice at a time.
    // Strategy: fetch with memcmp on magic, then get minimal data for scoring.

    // Use dataSize filter only — all PERCOLAT slabs are exactly 992560 bytes.
    // Then validate magic in code after fetching.
    const accounts = await connection.getProgramAccounts(CONFIG.PROGRAM_ID, {
      filters: [
        { dataSize: 992560 },
      ],
      dataSlice: {
        offset: 0,
        // Get header + config + engine scoring fields
        // We need up to offset 1314 (numUsedAccounts at 1312 + 2 bytes)
        length: 1314,
      },
    });

    if (accounts.length === 0) {
      console.warn('No active Percolator slabs found');
      return null;
    }

    const currentSlot = BigInt(await connection.getSlot());

    // Score each slab
    const candidates: DiscoveredSlab[] = [];
    for (const { pubkey, account } of accounts) {
      const data = Buffer.from(account.data);
      if (data.length < 1314) continue;

      // Validate magic
      const magic = data.readBigUInt64LE(0);
      if (magic !== 0x504552434f4c4154n) continue; // Not a PERCOLAT slab

      // Read scoring fields
      const numUsedAccounts = data.readUInt16LE(1312); // ENGINE_OFF + ENGINE_NUM_USED_OFF
      const lastCrankSlot = data.readBigUInt64LE(624); // ENGINE_OFF + ENGINE_LAST_CRANK_SLOT_OFF

      // Vault (u128 at engine offset 0 = absolute offset 392)
      const vaultLo = data.readBigUInt64LE(392);
      const vaultHi = data.readBigUInt64LE(400);
      const vaultLamports = (vaultHi << 64n) | vaultLo;

      // Vault pubkey from config (at offset 104 = CONFIG_OFFSET + 32)
      const vaultPubkey = new PublicKey(data.subarray(104, 136));

      // Oracle authority from config (offset 72 + 256 = 328... need to compute correctly)
      // oracleAuthority is at CONFIG_OFFSET + 256 = 72 + 256 = 328
      const oracleAuthority = new PublicKey(data.subarray(328, 360));

      candidates.push({
        pubkey,
        numUsedAccounts,
        lastCrankSlot,
        vaultLamports,
        vaultPubkey,
        oracleAuthority,
      });
    }

    // Sort by: most accounts first, then most recent crank, then highest TVL
    candidates.sort((a, b) => {
      // Primary: number of accounts (more = more interesting)
      if (b.numUsedAccounts !== a.numUsedAccounts) {
        return b.numUsedAccounts - a.numUsedAccounts;
      }
      // Secondary: most recently cranked
      const slotDiffA = currentSlot - a.lastCrankSlot;
      const slotDiffB = currentSlot - b.lastCrankSlot;
      if (slotDiffA !== slotDiffB) {
        return Number(slotDiffA - slotDiffB); // Lower diff = more recent = better
      }
      // Tertiary: highest TVL
      return Number(b.vaultLamports - a.vaultLamports);
    });

    const best = candidates[0] || null;
    if (best) {
      console.log(`Discovered active slab: ${best.pubkey.toBase58()} (${best.numUsedAccounts} accounts, ${Number(best.vaultLamports) / 1e9} SOL TVL, lastCrank slot ${best.lastCrankSlot})`);
      setCache(DISCOVERY_CACHE_KEY, best);
    }

    return best;
  } catch (error) {
    console.error('Slab discovery failed:', error);

    // Fallback: try the hardcoded slab
    try {
      const info = await connection.getAccountInfo(CONFIG.SLAB);
      if (info) {
        const data = Buffer.from(info.data);
        return {
          pubkey: CONFIG.SLAB,
          numUsedAccounts: data.readUInt16LE(1312),
          lastCrankSlot: data.readBigUInt64LE(624),
          vaultLamports: 0n,
          vaultPubkey: CONFIG.VAULT,
          oracleAuthority: new PublicKey(data.subarray(328, 360)),
        };
      }
    } catch {
      // Hardcoded slab also gone
    }

    return null;
  }
}
