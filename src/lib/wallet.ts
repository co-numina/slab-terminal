/**
 * Server-side wallet management for signing transactions.
 *
 * Loads keypair from env vars:
 *   - PERCOLATOR_WALLET: base58-encoded secret key (64 bytes)
 *   - PERCOLATOR_WALLET_JSON: JSON array of 64 bytes, e.g. [1,2,3,...]
 *
 * Falls back to generating a fresh devnet keypair if no env var is set.
 * Auto-airdrops 2 SOL on first use if balance is 0 (devnet only).
 */
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getConnection } from './connection';

let _wallet: Keypair | null = null;
let _airdropAttempted = false;

/**
 * Get the server wallet keypair. Loads once, caches in memory.
 */
export function getServerWallet(): Keypair {
  if (_wallet) return _wallet;

  const b58 = process.env.PERCOLATOR_WALLET;
  const json = process.env.PERCOLATOR_WALLET_JSON;

  if (b58) {
    // base58-encoded secret key
    // @solana/web3.js re-exports bs58 internally; we decode manually
    const bytes = decodeBase58(b58);
    _wallet = Keypair.fromSecretKey(bytes);
    console.log(`[wallet] Loaded from PERCOLATOR_WALLET: ${_wallet.publicKey.toBase58()}`);
  } else if (json) {
    // JSON array of bytes
    const bytes = new Uint8Array(JSON.parse(json));
    _wallet = Keypair.fromSecretKey(bytes);
    console.log(`[wallet] Loaded from PERCOLATOR_WALLET_JSON: ${_wallet.publicKey.toBase58()}`);
  } else {
    // Generate fresh devnet keypair
    _wallet = Keypair.generate();
    console.log(`[wallet] Generated fresh keypair: ${_wallet.publicKey.toBase58()}`);
    console.log(`[wallet] Set PERCOLATOR_WALLET env var for persistence`);
  }

  return _wallet;
}

/**
 * Get wallet SOL balance.
 */
export async function getWalletBalance(): Promise<number> {
  const wallet = getServerWallet();
  const connection = getConnection();
  const balance = await connection.getBalance(wallet.publicKey);
  return balance / LAMPORTS_PER_SOL;
}

/**
 * Ensure wallet has SOL. Airdrops 2 SOL on devnet if balance is 0.
 * Only attempts once per server lifetime to avoid spam.
 * Uses the public devnet RPC for airdrops (Helius doesn't support requestAirdrop).
 */
export async function ensureWalletFunded(): Promise<void> {
  if (_airdropAttempted) return;
  _airdropAttempted = true;

  const connection = getConnection();
  const wallet = getServerWallet();

  try {
    const balance = await connection.getBalance(wallet.publicKey);
    if (balance > 0) {
      console.log(`[wallet] Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
      return;
    }

    // Only airdrop on devnet
    const rpcUrl = process.env.SOLANA_RPC_URL || '';
    const isDevnet = rpcUrl.includes('devnet') || rpcUrl === '' || connection.rpcEndpoint.includes('devnet');
    if (!isDevnet) {
      console.warn(`[wallet] Balance is 0 but not on devnet — skipping airdrop`);
      return;
    }

    // Use public devnet endpoint for airdrops (Helius doesn't support requestAirdrop)
    const { Connection: AirdropConnection } = await import('@solana/web3.js');
    const airdropConn = new AirdropConnection('https://api.devnet.solana.com', 'confirmed');

    console.log(`[wallet] Requesting 2 SOL airdrop via public devnet...`);
    const sig = await airdropConn.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);

    // Wait for confirmation with timeout
    const start = Date.now();
    while (Date.now() - start < 30_000) {
      const status = await airdropConn.getSignatureStatus(sig);
      if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
        console.log(`[wallet] Airdrop confirmed: ${sig}`);
        return;
      }
      if (status?.value?.err) {
        console.warn(`[wallet] Airdrop tx error:`, status.value.err);
        return;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    console.warn(`[wallet] Airdrop confirmation timed out (non-critical)`);
  } catch (err) {
    console.warn(`[wallet] Airdrop failed (non-critical):`, err);
  }
}

// ── Base58 decoder ──────────────────────────────────────────────────────
// Minimal base58 decoder to avoid importing bs58 as a separate dep.
// @solana/web3.js has it internally but doesn't export it cleanly.

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decodeBase58(input: string): Uint8Array {
  const bytes: number[] = [0];
  for (const char of input) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx < 0) throw new Error(`Invalid base58 character: ${char}`);
    let carry = idx;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Handle leading 1s (zeros in base58)
  for (const char of input) {
    if (char !== '1') break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}
