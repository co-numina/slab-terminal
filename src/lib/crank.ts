/**
 * Crank execution engine + Vercel-compatible bot loop.
 *
 * On Vercel, serverless functions are stateless — no persistent setInterval.
 * The bot works by piggybacking on SWR polling:
 *   1. Frontend polls GET /api/crank/status every 3s
 *   2. If bot flag is "on" AND enough time has passed, the status handler
 *      auto-fires a crank before returning status.
 *   3. The browser's SWR polling acts as the heartbeat.
 *
 * In local dev (next dev), we could also use setInterval, but the
 * polling approach works universally.
 */
import {
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { getConnection } from './connection';
import { getServerWallet, ensureWalletFunded, getWalletBalance } from './wallet';
import { buildKeeperCrankInstruction } from './instructions';
import { discoverAllSlabs } from './discovery';
import { CONFIG } from './constants';

// ── Bot state (in-memory, resets on cold start) ─────────────────────────

export interface CrankBotStatus {
  running: boolean;
  walletPubkey: string;
  walletBalance: number;
  lastCrankSignature: string | null;
  lastCrankSlot: number;
  lastCrankTimestamp: number;
  crankCount: number;
  errorCount: number;
  lastError: string | null;
  intervalMs: number;
  slabPubkey: string;
}

const state = {
  running: false,
  lastCrankSignature: null as string | null,
  lastCrankSlot: 0,
  lastCrankTimestamp: 0,
  crankCount: 0,
  errorCount: 0,
  lastError: null as string | null,
  intervalMs: 5000,
  primarySlabPubkey: null as string | null,
};

// ── Primary slab resolution ─────────────────────────────────────────────

async function getPrimarySlabPubkey(): Promise<PublicKey> {
  if (state.primarySlabPubkey) {
    return new PublicKey(state.primarySlabPubkey);
  }

  const connection = getConnection();
  const slabs = await discoverAllSlabs(connection);
  if (slabs.length === 0) {
    throw new Error('No active slabs found');
  }

  // slab-0 = most accounts = primary
  state.primarySlabPubkey = slabs[0].pubkey.toBase58();
  return slabs[0].pubkey;
}

// ── Execute a single crank ──────────────────────────────────────────────

export async function executeCrank(
  slabPubkeyOverride?: string,
): Promise<{ signature: string; slot: number }> {
  const connection = getConnection();
  const wallet = getServerWallet();

  // Ensure funded on first crank
  await ensureWalletFunded();

  const slabPubkey = slabPubkeyOverride
    ? new PublicKey(slabPubkeyOverride)
    : await getPrimarySlabPubkey();

  // Build transaction with compute budget + keeper crank
  const crankIx = buildKeeperCrankInstruction(
    wallet.publicKey,
    slabPubkey,
    CONFIG.ORACLE,
  );

  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 400_000,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

  const tx = new Transaction();
  tx.add(computeBudgetIx);
  tx.add(crankIx);
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = wallet.publicKey;
  tx.sign(wallet);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
    maxRetries: 2,
  });

  // Confirm with polling (more reliable than confirmTransaction on devnet)
  let slot = 0;
  const confirmStart = Date.now();
  while (Date.now() - confirmStart < 30_000) {
    const status = await connection.getSignatureStatus(signature);
    if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
      slot = status.value.slot ?? 0;
      break;
    }
    if (status?.value?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  if (slot === 0) {
    // Try to get slot from getTransaction as fallback
    try {
      const txInfo = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      slot = txInfo?.slot ?? 0;
    } catch {
      // Non-critical — tx may still be confirming
    }
  }

  // Update state
  state.lastCrankSignature = signature;
  state.lastCrankSlot = slot;
  state.lastCrankTimestamp = Date.now();
  state.crankCount++;
  state.lastError = null;

  console.log(`[crank] OK sig=${signature.slice(0, 12)}... slot=${slot} count=${state.crankCount}`);

  return { signature, slot };
}

// ── Bot control ─────────────────────────────────────────────────────────

export function startCrankBot(intervalMs?: number): void {
  if (intervalMs && intervalMs >= 2000) {
    state.intervalMs = intervalMs;
  }
  state.running = true;
  console.log(`[crank] Bot started (interval=${state.intervalMs}ms)`);
}

export function stopCrankBot(): void {
  state.running = false;
  console.log(`[crank] Bot stopped`);
}

/**
 * Called from the status endpoint on each poll.
 * If bot is "on" and enough time has passed, auto-fires a crank.
 * This is the Vercel-compatible heartbeat mechanism.
 */
export async function maybeCrankOnPoll(): Promise<boolean> {
  if (!state.running) return false;

  const elapsed = Date.now() - state.lastCrankTimestamp;
  if (elapsed < state.intervalMs) return false;

  try {
    await executeCrank();
    return true;
  } catch (err) {
    state.errorCount++;
    state.lastError = err instanceof Error ? err.message : String(err);
    console.error(`[crank] Auto-crank failed:`, state.lastError);
    // Don't throw — let the status endpoint still return
    return false;
  }
}

// ── Status ──────────────────────────────────────────────────────────────

export async function getCrankBotStatus(): Promise<CrankBotStatus> {
  const wallet = getServerWallet();

  let balance = 0;
  try {
    balance = await getWalletBalance();
  } catch {
    // Non-critical
  }

  return {
    running: state.running,
    walletPubkey: wallet.publicKey.toBase58(),
    walletBalance: balance,
    lastCrankSignature: state.lastCrankSignature,
    lastCrankSlot: state.lastCrankSlot,
    lastCrankTimestamp: state.lastCrankTimestamp,
    crankCount: state.crankCount,
    errorCount: state.errorCount,
    lastError: state.lastError,
    intervalMs: state.intervalMs,
    slabPubkey: state.primarySlabPubkey ?? '',
  };
}
