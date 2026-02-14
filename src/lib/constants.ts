import { PublicKey } from '@solana/web3.js';

export const CONFIG = {
  RPC_URL: process.env.SOLANA_RPC_URL || 'https://devnet.helius-rpc.com/?api-key=15923248-113d-4b5b-8177-290c6e5e799b',
  FALLBACK_RPC_URL: 'https://api.devnet.solana.com',

  PROGRAM_ID: new PublicKey('2SSnp35m7FQ7cRLNKGdW5UzjYFF6RBUNq7d3m5mqNByp'),
  MATCHER_PROGRAM: new PublicKey('4HcGCsyjAqnFua5ccuXyt8KRRQzKFbGTJkVChpS7Yfzy'),
  SLAB: new PublicKey('A7wQtRT9DhFqYho8wTVqQCDc7kYPTUXGPATiyVbZKVFs'),
  MINT: new PublicKey('So11111111111111111111111111111111111111112'),
  VAULT: new PublicKey('63juJmvm1XHCHveWv9WdanxqJX6tD6DLFTZD7dvH12dc'),
  VAULT_PDA: new PublicKey('4C6cZFwwDnEyL81YZPY9xBUnnBuM9gWHcvjpHa71y3V6'),
  ORACLE: new PublicKey('99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR'),

  // LP 0 - Passive Matcher (50bps spread)
  LP0_PDA: new PublicKey('7YgxweQCVnBDfnP7hBdrBLV5NXpSLPS9mx6fgaGnH3jd'),
  LP0_MATCHER_CTX: new PublicKey('5n3jT6iy9TK3XNMQarC1sK26zS8ofjLG3dvE9iDEFYhK'),

  // LP 4 - vAMM Matcher
  LP4_PDA: new PublicKey('CwfVwVayiuVxXmagcP8Rha7eow29NUtHzFNdzikCzA8h'),
  LP4_MATCHER_CTX: new PublicKey('BUWfYszAAUuGkGiaMT9ahnkHeHFQ5MbC7STQdhS28cZF'),
} as const;

// Cache durations in ms
export const CACHE_DURATIONS = {
  SLAB: 5_000,        // 5s - used by market + positions
  ORACLE: 5_000,      // 5s
  VAULT: 10_000,      // 10s
  MATCHER: 15_000,    // 15s
  MARKET: 5_000,
  POSITIONS: 10_000,
  LPS: 15_000,
  ACTIVITY: 10_000,
} as const;
