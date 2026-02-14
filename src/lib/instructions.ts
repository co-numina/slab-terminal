/**
 * Percolator instruction encoding.
 * Ported from percolator-cli/src/abi/encode.ts + instructions.ts.
 * Phase 1: keeper crank only. Later phases add trade, deposit, withdraw, etc.
 */
import {
  PublicKey,
  TransactionInstruction,
  SYSVAR_CLOCK_PUBKEY,
} from '@solana/web3.js';
import { CONFIG } from './constants';

// ── Encoding primitives ─────────────────────────────────────────────────

export function encU8(v: number): Buffer {
  const buf = Buffer.alloc(1);
  buf.writeUInt8(v);
  return buf;
}

export function encU16(v: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(v);
  return buf;
}

export function encU64(v: bigint | number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(v));
  return buf;
}

export function encI64(v: bigint | number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(v));
  return buf;
}

export function encI128(v: bigint | number): Buffer {
  const buf = Buffer.alloc(16);
  const big = BigInt(v);
  buf.writeBigInt64LE(big & 0xFFFFFFFFFFFFFFFFn, 0);
  buf.writeBigInt64LE(big >> 64n, 8);
  return buf;
}

export function encPubkey(pk: PublicKey): Buffer {
  return Buffer.from(pk.toBytes());
}

// ── Instruction tags ────────────────────────────────────────────────────

export const IX_TAG = {
  InitSlab: 0,
  InitUser: 1,
  SetLpParams: 2,
  DepositCollateral: 3,
  WithdrawCollateral: 4,
  KeeperCrank: 5,
  TradeNoCpi: 6,
  CloseAccount: 8,
  TradeCpi: 10,
  SetOracleAuthority: 16,
  PushOraclePrice: 17,
} as const;

// ── Sentinel values ─────────────────────────────────────────────────────

/** Permissionless crank — caller is not an account in the slab */
export const CRANK_NO_CALLER = 65535;

// ── Keeper Crank ────────────────────────────────────────────────────────

/**
 * Encode keeper-crank instruction data.
 * Layout: [u8 tag, u16 callerIdx, u8 allowPanic]
 */
export function encodeKeeperCrank(
  callerIdx: number = CRANK_NO_CALLER,
  allowPanic: boolean = false,
): Buffer {
  return Buffer.concat([
    encU8(IX_TAG.KeeperCrank),
    encU16(callerIdx),
    encU8(allowPanic ? 1 : 0),
  ]);
}

/**
 * Build a keeper-crank TransactionInstruction.
 *
 * Accounts (in order):
 *   0. caller   — signer, not writable
 *   1. slab     — not signer, writable
 *   2. clock    — SYSVAR_CLOCK, not writable
 *   3. oracle   — oracle feed, not writable
 */
export function buildKeeperCrankInstruction(
  callerPubkey: PublicKey,
  slabPubkey: PublicKey,
  oraclePubkey: PublicKey = CONFIG.ORACLE,
  callerIdx: number = CRANK_NO_CALLER,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: CONFIG.PROGRAM_ID,
    keys: [
      { pubkey: callerPubkey, isSigner: true, isWritable: false },
      { pubkey: slabPubkey, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: oraclePubkey, isSigner: false, isWritable: false },
    ],
    data: encodeKeeperCrank(callerIdx),
  });
}
