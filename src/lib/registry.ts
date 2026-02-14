/**
 * Percolator Program Registry — all known deployments across devnet + mainnet.
 *
 * This is the foundation for SLAB SCOPE's multi-program ecosystem scanning.
 * Each entry describes a deployed Percolator program with its network,
 * expected slab sizes, and optional oracle override.
 */

export type NetworkId = 'devnet' | 'mainnet';

export interface ProgramEntry {
  /** Unique identifier, e.g. "toly-original" */
  id: string;
  /** Human-readable label, e.g. "Toly Original" */
  label: string;
  /** Base58 program pubkey */
  programId: string;
  /** Network this program lives on */
  network: NetworkId;
  /** Expected slab account sizes in bytes (for getProgramAccounts filters) */
  slabSizes: number[];
  /** Oracle account override if different from default */
  oracleAddress?: string;
  /** Brief description */
  description?: string;
}

export const PROGRAM_REGISTRY: ProgramEntry[] = [
  {
    id: 'toly-original',
    label: 'Toly OG',
    programId: '2SSnp35m7FQ7cRLNKGdW5UzjYFF6RBUNq7d3m5mqNByp',
    network: 'devnet',
    slabSizes: [992560],
    oracleAddress: '99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR',
    description: 'Original Percolator by Toly — inverted SOL/USD market',
  },
  {
    id: 'launch-small',
    label: 'Launch 240',
    programId: 'FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD',
    network: 'devnet',
    slabSizes: [62808],
    description: 'Percolator Launch — 240-account slab tier',
  },
  {
    id: 'launch-medium',
    label: 'Launch 960',
    programId: 'FwfBKZXbYr4vTK23bMFkbgKq3npJ3MSDxEaKmq9Aj4Qn',
    network: 'devnet',
    slabSizes: [249480],
    description: 'Percolator Launch — 960-account slab tier',
  },
  {
    id: 'launch-large',
    label: 'Launch 4096',
    programId: 'g9msRSV3sJmmE3r5Twn9HuBsxzuuRGTjKCVTKudm9in',
    network: 'devnet',
    slabSizes: [992560],
    description: 'Percolator Launch — 4096-account slab tier',
  },
  {
    id: 'sov-mainnet',
    label: 'SOV',
    programId: 'GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24',
    network: 'mainnet',
    slabSizes: [992560],
    description: 'MidTermDev SOV — mainnet deployment with $PERC token',
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────

export function getRegistryByNetwork(network: NetworkId): ProgramEntry[] {
  return PROGRAM_REGISTRY.filter((e) => e.network === network);
}

export function getRegistryEntry(id: string): ProgramEntry | undefined {
  return PROGRAM_REGISTRY.find((e) => e.id === id);
}

export function getAllNetworks(): NetworkId[] {
  return [...new Set(PROGRAM_REGISTRY.map((e) => e.network))];
}
