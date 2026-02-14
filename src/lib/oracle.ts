/**
 * Oracle price reading — Chainlink OCR2 on devnet
 * Ported from percolator-cli/scripts/dump-state.ts
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { CONFIG } from './constants';

export interface OraclePrice {
  /** Raw USD price (e.g. 142.47) */
  rawUsd: number;
  /** Price in e6 format (USD per SOL * 1e6) */
  rawPriceE6: bigint;
  /** Inverted price in e6 format (used on-chain for inverted market) */
  invertedPriceE6: bigint;
  /** Human-readable SOL/USD price after inversion */
  solUsdPrice: number;
  /** Chainlink decimals */
  decimals: number;
}

/**
 * Read the Chainlink OCR2 oracle price.
 * Layout: decimals at byte 138 (u8), answer at byte 216 (i64LE)
 */
export async function getOraclePrice(connection: Connection): Promise<OraclePrice> {
  const info = await connection.getAccountInfo(CONFIG.ORACLE);
  if (!info) {
    throw new Error(`Oracle account not found: ${CONFIG.ORACLE.toBase58()}`);
  }

  const data = info.data;
  const decimals = data.readUInt8(138);
  const answer = data.readBigInt64LE(216);

  // Convert to e6 format
  const rawPriceE6 = answer * 1_000_000n / BigInt(10 ** decimals);

  // Invert for this market (on-chain stores 1/SOL prices)
  const invertedPriceE6 = rawPriceE6 > 0n ? 1_000_000_000_000n / rawPriceE6 : 0n;

  // Human-readable SOL/USD
  const rawUsd = Number(answer) / (10 ** decimals);
  const solUsdPrice = rawUsd;

  return {
    rawUsd,
    rawPriceE6,
    invertedPriceE6,
    solUsdPrice,
    decimals,
  };
}

/**
 * Fallback: get oracle price from the slab's lastEffectivePriceE6 field.
 * This is updated on every crank and trade.
 */
export function getEffectiveOraclePrice(lastEffectivePriceE6: bigint, invert: number): number {
  if (lastEffectivePriceE6 === 0n) return 0;
  if (invert === 1) {
    // Stored as inverted, convert back to SOL/USD
    return 1_000_000 / Number(lastEffectivePriceE6);
  }
  return Number(lastEffectivePriceE6) / 1_000_000;
}
