import { Connection } from '@solana/web3.js';
import { CONFIG } from './constants';

// Shared connection instance
let _connection: Connection | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(CONFIG.RPC_URL, 'confirmed');
  }
  return _connection;
}

// Simple in-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();

export function getCached<T>(key: string, maxAgeMs: number): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < maxAgeMs) {
    return entry.data as T;
  }
  return null;
}

export function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function clearCache(): void {
  cache.clear();
}
