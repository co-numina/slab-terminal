/**
 * Slab auto-discovery — finds active Percolator slabs.
 *
 * Original: single-program discovery for Toly Original (unchanged).
 * Extended: multi-program, multi-size discovery for SLAB SCOPE radar.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { CONFIG } from './constants';
import { getCached, setCache } from './connection';
import type { ProgramEntry, NetworkId } from './registry';

const DISCOVERY_CACHE_KEY = 'discovered_slabs';
const DISCOVERY_CACHE_MS = 60_000; // Re-discover every 60s

const PERCOLAT_MAGIC = 0x504552434f4c4154n;

export interface DiscoveredSlab {
  pubkey: PublicKey;
  label: string;  // e.g. "slab-0", "slab-1"
  numUsedAccounts: number;
  lastCrankSlot: bigint;
  vaultPubkey: PublicKey;
  // Extended fields for multi-program scanning
  programId?: string;
  programLabel?: string;
  network?: NetworkId;
  slabSize?: number;
}

// ── Parse a slab header from minimal data slice ─────────────────────────

function parseSlabHeader(
  pubkey: PublicKey,
  data: Buffer,
): { numUsedAccounts: number; lastCrankSlot: bigint; vaultPubkey: PublicKey } | null {
  if (data.length < 1314) return null;

  // Validate magic
  const magic = data.readBigUInt64LE(0);
  if (magic !== PERCOLAT_MAGIC) return null;

  const numUsedAccounts = data.readUInt16LE(1312);
  const lastCrankSlot = data.readBigUInt64LE(624);
  const vaultPubkey = new PublicKey(data.subarray(104, 136));

  return { numUsedAccounts, lastCrankSlot, vaultPubkey };
}

// ── Original single-program discovery (unchanged behavior) ──────────────

/**
 * Discover ALL active Percolator slabs for Toly Original.
 * Returns slabs with numUsedAccounts > 0, sorted by most accounts first.
 *
 * @deprecated for radar use. Use discoverSlabsForProgram() instead.
 * Kept for backward compatibility with existing API routes.
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
      const parsed = parseSlabHeader(pubkey, data);
      if (!parsed || parsed.numUsedAccounts === 0) continue;

      candidates.push({
        pubkey,
        label: '',
        numUsedAccounts: parsed.numUsedAccounts,
        lastCrankSlot: parsed.lastCrankSlot,
        vaultPubkey: parsed.vaultPubkey,
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

// ── Multi-program discovery for SLAB SCOPE ──────────────────────────────

/**
 * Discover slabs for a specific program entry.
 * Queries each known slab size for the program.
 * Returns all active slabs (numUsedAccounts > 0) with program metadata.
 */
export async function discoverSlabsForProgram(
  connection: Connection,
  entry: ProgramEntry,
): Promise<DiscoveredSlab[]> {
  const cacheKey = `discovered_slabs_${entry.id}`;
  const cached = getCached<DiscoveredSlab[]>(cacheKey, DISCOVERY_CACHE_MS);
  if (cached) return cached;

  const programPubkey = new PublicKey(entry.programId);
  const allCandidates: DiscoveredSlab[] = [];

  for (const slabSize of entry.slabSizes) {
    try {
      const accounts = await connection.getProgramAccounts(programPubkey, {
        filters: [{ dataSize: slabSize }],
        dataSlice: {
          offset: 0,
          length: Math.min(1314, slabSize), // Don't request more than slab size
        },
      });

      for (const { pubkey, account } of accounts) {
        const data = Buffer.from(account.data);
        const parsed = parseSlabHeader(pubkey, data);
        if (!parsed) continue;

        // For radar, include all slabs (even empty ones) for count tracking
        allCandidates.push({
          pubkey,
          label: '',
          numUsedAccounts: parsed.numUsedAccounts,
          lastCrankSlot: parsed.lastCrankSlot,
          vaultPubkey: parsed.vaultPubkey,
          programId: entry.programId,
          programLabel: entry.label,
          network: entry.network,
          slabSize,
        });
      }
    } catch (error) {
      console.warn(`[discovery] Failed for ${entry.id} slabSize=${slabSize}:`, error);
      // Continue with next size — graceful degradation
    }
  }

  // Sort by numUsedAccounts desc
  allCandidates.sort((a, b) => {
    if (b.numUsedAccounts !== a.numUsedAccounts) {
      return b.numUsedAccounts - a.numUsedAccounts;
    }
    return Number(b.lastCrankSlot - a.lastCrankSlot);
  });

  // Assign labels
  for (let i = 0; i < allCandidates.length; i++) {
    allCandidates[i].label = `slab-${i}`;
  }

  if (allCandidates.length > 0) {
    console.log(`[discovery] ${entry.id}: ${allCandidates.length} slabs, ${allCandidates.reduce((s, c) => s + c.numUsedAccounts, 0)} accounts`);
  }

  setCache(cacheKey, allCandidates);
  return allCandidates;
}
