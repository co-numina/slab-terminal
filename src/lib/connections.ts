/**
 * Multi-network connection pool for SLAB SCOPE.
 *
 * Provides network-keyed connections for devnet + mainnet scanning.
 * The existing `connection.ts` singleton is untouched for backward compatibility.
 */
import { Connection } from '@solana/web3.js';
import type { NetworkId } from './registry';

const RPC_URLS: Record<NetworkId, string> = {
  devnet: process.env.SOLANA_RPC_URL || 'https://devnet.helius-rpc.com/?api-key=15923248-113d-4b5b-8177-290c6e5e799b',
  mainnet: process.env.SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com',
};

const connectionPool = new Map<NetworkId, Connection>();

/**
 * Get a connection for a specific network. Lazy-initialized, cached per-network.
 */
export function getNetworkConnection(network: NetworkId): Connection {
  let conn = connectionPool.get(network);
  if (!conn) {
    conn = new Connection(RPC_URLS[network], 'confirmed');
    connectionPool.set(network, conn);
  }
  return conn;
}

/**
 * Get the current slot for a network.
 */
export async function getNetworkSlot(network: NetworkId): Promise<number> {
  const conn = getNetworkConnection(network);
  return conn.getSlot('confirmed');
}
