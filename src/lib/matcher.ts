/**
 * Matcher context parsing — 320-byte LP configuration accounts
 * Binary layout starts at byte 64 (first 64 bytes are matcher return data)
 */
import { Connection, PublicKey } from '@solana/web3.js';

export interface MatcherContext {
  magic: string;
  version: number;
  kind: 'passive' | 'vamm';
  kindRaw: number;
  lpPda: PublicKey;
  tradingFeeBps: number;
  baseSpreadBps: number;
  maxTotalBps: number;
  impactKBps: number;
  liquidityNotionalE6: number;
  maxFillAbs: number;
  inventoryBase: number;
  lastOraclePriceE6: number;
  lastExecPriceE6: number;
  maxInventoryAbs: number;
  // Derived (inverted for display)
  lastOraclePrice: number;
  lastExecPrice: number;
}

/**
 * Parse a matcher context account.
 * Data starts at offset 64 in the 320-byte account.
 */
export async function parseMatcherContext(
  connection: Connection,
  ctxPubkey: PublicKey,
): Promise<MatcherContext | null> {
  const accountInfo = await connection.getAccountInfo(ctxPubkey);
  if (!accountInfo) return null;

  const data = accountInfo.data;
  if (data.length < 320) return null;

  // Data starts at offset 64
  const offset = 64;
  const view = new DataView(data.buffer, data.byteOffset + offset);

  const magic = view.getBigUint64(0, true);
  const version = view.getUint32(8, true);
  const kind = data[offset + 12]; // 0=Passive, 1=vAMM

  // LP PDA (32 bytes at offset 16)
  const lpPda = new PublicKey(data.subarray(offset + 16, offset + 48));

  const tradingFeeBps = view.getUint32(48, true);
  const baseSpreadBps = view.getUint32(52, true);
  const maxTotalBps = view.getUint32(56, true);
  const impactKBps = view.getUint32(60, true);

  // u128 fields: read as two u64s
  const liquidityNotionalLow = Number(view.getBigUint64(64, true));
  const liquidityNotionalHigh = Number(view.getBigUint64(72, true));
  const liquidityNotionalE6 = liquidityNotionalLow + liquidityNotionalHigh * 2 ** 64;

  const maxFillLow = Number(view.getBigUint64(80, true));
  const maxFillHigh = Number(view.getBigUint64(88, true));
  const maxFillAbs = maxFillLow + maxFillHigh * 2 ** 64;

  // inventory_base is i128 (signed)
  const inventoryLow = Number(view.getBigUint64(96, true));
  const inventoryHigh = Number(view.getBigInt64(104, true)); // signed high word
  const inventoryBase = inventoryLow + inventoryHigh * 2 ** 64;

  const lastOraclePriceE6 = Number(view.getBigUint64(112, true));
  const lastExecPriceE6 = Number(view.getBigUint64(120, true));

  // max_inventory_abs is u128
  const maxInvLow = Number(view.getBigUint64(128, true));
  const maxInvHigh = Number(view.getBigUint64(136, true));
  const maxInventoryAbs = maxInvLow + maxInvHigh * 2 ** 64;

  // Invert prices for display (INVERTED market: stored price = 1/SOL)
  const lastOraclePrice = lastOraclePriceE6 > 0 ? 1_000_000 / lastOraclePriceE6 : 0;
  const lastExecPrice = lastExecPriceE6 > 0 ? 1_000_000 / lastExecPriceE6 : 0;

  return {
    magic: magic.toString(16),
    version,
    kind: kind === 0 ? 'passive' : 'vamm',
    kindRaw: kind,
    lpPda,
    tradingFeeBps,
    baseSpreadBps,
    maxTotalBps,
    impactKBps,
    liquidityNotionalE6,
    maxFillAbs,
    inventoryBase,
    lastOraclePriceE6,
    lastExecPriceE6,
    maxInventoryAbs,
    lastOraclePrice,
    lastExecPrice,
  };
}
