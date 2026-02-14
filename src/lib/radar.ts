/**
 * Ecosystem Radar Scanner — SLAB SCOPE core.
 *
 * Scans ALL known Percolator programs across devnet + mainnet.
 * Produces health-scored ecosystem overview with per-program stats.
 *
 * Performance: parallel slot fetches + parallel program discovery per network.
 */
import { getCached, setCache } from './connection';
import { getNetworkConnection, getNetworkSlot } from './connections';
import { PROGRAM_REGISTRY, getAllNetworks, getRegistryByNetwork } from './registry';
import { discoverSlabsForProgram } from './discovery';
import type { NetworkId } from './registry';

// ── Types ───────────────────────────────────────────────────────────────

export type HealthStatus = 'active' | 'stale' | 'idle' | 'dead';

export interface SlabRadarEntry {
  pubkey: string;
  label: string;
  slabSize: number;
  numUsedAccounts: number;
  lastCrankSlot: number;
  lastCrankAge: number;       // seconds since last crank
  vaultPubkey: string;
  collateralMint: string;     // extracted from header for early mint resolution
  collateralSymbol?: string;  // resolved token symbol (SOL, USDC, etc.)
  health: HealthStatus;
}

export interface ProgramRadarEntry {
  id: string;
  label: string;
  programId: string;
  network: NetworkId;
  description?: string;
  slabCount: number;
  activeSlabCount: number;
  accountCount: number;
  lastCrankSlot: number;
  lastCrankAge: number;       // seconds since most recent crank
  health: HealthStatus;
  slabs: SlabRadarEntry[];
  error?: string;
}

export interface EcosystemRadar {
  programs: ProgramRadarEntry[];
  totals: {
    totalPrograms: number;
    totalSlabs: number;
    totalActiveSlabs: number;
    totalAccounts: number;
    activePrograms: number;
    stalePrograms: number;
    idlePrograms: number;
    deadPrograms: number;
  };
  networks: Record<NetworkId, {
    programs: number;
    slabs: number;
    accounts: number;
  }>;
  networkSlots: Record<NetworkId, number>;  // expose slots for reuse by top-markets
  scanTimestamp: string;
  scanDurationMs: number;
}

// ── Health scoring ──────────────────────────────────────────────────────

function computeHealth(
  lastCrankSlot: number,
  currentSlot: number,
  accountCount: number,
): HealthStatus {
  if (accountCount === 0) return 'dead';

  const crankAgeSec = (currentSlot - lastCrankSlot) * 0.4;

  if (crankAgeSec < 3600) return 'active';       // cranked < 1 hour
  if (crankAgeSec < 86400) return 'stale';        // cranked < 1 day
  return 'idle';                                   // > 1 day since crank
}

// ── Scanner ─────────────────────────────────────────────────────────────

const RADAR_CACHE_KEY = 'radar_ecosystem';
const RADAR_CACHE_MS = 30_000; // 30s cache

// In-flight deduplication: when multiple API routes call scanEcosystem()
// simultaneously on cold start, they share the same promise instead of
// each triggering a separate scan.
let inflight: Promise<EcosystemRadar> | null = null;

export async function scanEcosystem(): Promise<EcosystemRadar> {
  const cached = getCached<EcosystemRadar>(RADAR_CACHE_KEY, RADAR_CACHE_MS);
  if (cached) return cached;

  // Deduplicate concurrent calls
  if (inflight) return inflight;
  inflight = _scanEcosystemImpl();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

async function _scanEcosystemImpl(): Promise<EcosystemRadar> {

  const scanStart = Date.now();
  const programs: ProgramRadarEntry[] = [];

  // Get current slot per network — PARALLEL (was sequential)
  const networkSlots = new Map<NetworkId, number>();
  const slotResults = await Promise.all(
    getAllNetworks().map(async (network) => {
      try {
        const slot = await getNetworkSlot(network);
        return [network, slot] as const;
      } catch (err) {
        console.warn(`[radar] Failed to get slot for ${network}:`, err);
        return [network, 0] as const;
      }
    }),
  );
  for (const [network, slot] of slotResults) {
    networkSlots.set(network, slot);
  }

  // Scan programs — PARALLEL per network (was fully sequential)
  for (const network of getAllNetworks()) {
    const entries = getRegistryByNetwork(network);
    const connection = getNetworkConnection(network);
    const currentSlot = networkSlots.get(network) ?? 0;

    // Discover all programs on this network in parallel
    const discoveryResults = await Promise.allSettled(
      entries.map(async (entry) => {
        const slabs = await discoverSlabsForProgram(connection, entry);
        return { entry, slabs };
      }),
    );

    for (const result of discoveryResults) {
      if (result.status === 'rejected') {
        // Find which entry failed — use index
        const idx = discoveryResults.indexOf(result);
        const entry = entries[idx];
        const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.warn(`[radar] Failed to scan ${entry.id}:`, errMsg);
        programs.push({
          id: entry.id,
          label: entry.label,
          programId: entry.programId,
          network: entry.network,
          description: entry.description,
          slabCount: 0,
          activeSlabCount: 0,
          accountCount: 0,
          lastCrankSlot: 0,
          lastCrankAge: 0,
          health: 'dead',
          slabs: [],
          error: errMsg,
        });
        continue;
      }

      const { entry, slabs } = result.value;

      // Build per-slab entries
      const slabEntries: SlabRadarEntry[] = slabs.map((s) => {
        const lastCrank = Number(s.lastCrankSlot);
        const crankAge = currentSlot > 0 ? (currentSlot - lastCrank) * 0.4 : 0;
        return {
          pubkey: s.pubkey.toBase58(),
          label: s.label,
          slabSize: s.slabSize ?? 0,
          numUsedAccounts: s.numUsedAccounts,
          lastCrankSlot: lastCrank,
          lastCrankAge: Math.round(crankAge),
          vaultPubkey: s.vaultPubkey.toBase58(),
          collateralMint: s.collateralMint?.toBase58() ?? '',
          health: computeHealth(lastCrank, currentSlot, s.numUsedAccounts),
        };
      });

      // Aggregate program-level stats
      const accountCount = slabs.reduce((s, sl) => s + sl.numUsedAccounts, 0);
      const activeSlabCount = slabEntries.filter((s) => s.numUsedAccounts > 0).length;
      const mostRecentCrank = slabEntries.reduce(
        (max, s) => Math.max(max, s.lastCrankSlot),
        0,
      );
      const crankAge = currentSlot > 0 ? (currentSlot - mostRecentCrank) * 0.4 : 0;

      programs.push({
        id: entry.id,
        label: entry.label,
        programId: entry.programId,
        network: entry.network,
        description: entry.description,
        slabCount: slabs.length,
        activeSlabCount,
        accountCount,
        lastCrankSlot: mostRecentCrank,
        lastCrankAge: Math.round(crankAge),
        health: computeHealth(mostRecentCrank, currentSlot, accountCount),
        slabs: slabEntries,
      });
    }
  }

  // Compute totals
  const totals = {
    totalPrograms: programs.length,
    totalSlabs: programs.reduce((s, p) => s + p.slabCount, 0),
    totalActiveSlabs: programs.reduce((s, p) => s + p.activeSlabCount, 0),
    totalAccounts: programs.reduce((s, p) => s + p.accountCount, 0),
    activePrograms: programs.filter((p) => p.health === 'active').length,
    stalePrograms: programs.filter((p) => p.health === 'stale').length,
    idlePrograms: programs.filter((p) => p.health === 'idle').length,
    deadPrograms: programs.filter((p) => p.health === 'dead').length,
  };

  // Per-network breakdown
  const networks: Record<NetworkId, { programs: number; slabs: number; accounts: number }> = {
    devnet: { programs: 0, slabs: 0, accounts: 0 },
    mainnet: { programs: 0, slabs: 0, accounts: 0 },
  };
  for (const p of programs) {
    const n = networks[p.network];
    n.programs++;
    n.slabs += p.slabCount;
    n.accounts += p.accountCount;
  }

  // Expose slots for reuse by top-markets (avoids re-fetching)
  const networkSlotsRecord: Record<NetworkId, number> = {
    devnet: networkSlots.get('devnet') ?? 0,
    mainnet: networkSlots.get('mainnet') ?? 0,
  };

  const result: EcosystemRadar = {
    programs,
    totals,
    networks,
    networkSlots: networkSlotsRecord,
    scanTimestamp: new Date().toISOString(),
    scanDurationMs: Date.now() - scanStart,
  };

  setCache(RADAR_CACHE_KEY, result);
  return result;
}
