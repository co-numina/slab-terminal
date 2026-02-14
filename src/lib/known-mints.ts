/**
 * Token mint address → symbol resolution.
 *
 * Hardcoded map for well-known mints, plus async resolver that fetches
 * Metaplex token metadata on-chain for unknown mints and caches forever.
 */
import { PublicKey, type Connection } from '@solana/web3.js';

// ── Hardcoded well-known mints ──────────────────────────────────────

export const KNOWN_MINTS: Record<string, string> = {
  'So11111111111111111111111111111111111111112': 'SOL',
  'A16Gd8AfaPnG6rohE6iPFDf6mr9gk519d6aMUJAperc': 'PERC',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
};

// ── In-memory cache for resolved mints ──────────────────────────────

const resolvedCache = new Map<string, string>();

// Metaplex Token Metadata Program
const TOKEN_METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

/**
 * Synchronous fallback — uses hardcoded map only.
 * Returns human-readable symbol or truncated address.
 */
export function resolveMintSymbol(mintAddress: string): string {
  if (KNOWN_MINTS[mintAddress]) return KNOWN_MINTS[mintAddress];
  if (resolvedCache.has(mintAddress)) return resolvedCache.get(mintAddress)!;
  return `${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`;
}

/**
 * Async resolver — fetches Metaplex metadata on-chain for unknown mints.
 * Caches results in memory so each mint is only fetched once per process.
 *
 * Returns the resolved symbol (or a truncated address if metadata unavailable).
 */
export async function resolveMintSymbolAsync(
  mintAddress: string,
  connection: Connection,
): Promise<string> {
  // Check hardcoded first
  if (KNOWN_MINTS[mintAddress]) return KNOWN_MINTS[mintAddress];

  // Check runtime cache
  if (resolvedCache.has(mintAddress)) return resolvedCache.get(mintAddress)!;

  // Try to fetch Metaplex metadata PDA
  try {
    const mintPubkey = new PublicKey(mintAddress);
    const [metadataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM.toBuffer(),
        mintPubkey.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM,
    );

    const info = await connection.getAccountInfo(metadataPda);
    if (info && info.data.length > 0) {
      const symbol = parseMetaplexSymbol(info.data);
      if (symbol) {
        resolvedCache.set(mintAddress, symbol);
        return symbol;
      }
    }
  } catch {
    // RPC error — fall through to truncated address
  }

  // Fallback: cache the truncated form so we don't retry
  const truncated = `${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`;
  resolvedCache.set(mintAddress, truncated);
  return truncated;
}

/**
 * Batch-resolve multiple mints in one shot. Dedupes and runs in parallel.
 */
export async function resolveMintSymbolsBatch(
  mintAddresses: string[],
  connection: Connection,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const toFetch: string[] = [];

  for (const addr of mintAddresses) {
    if (KNOWN_MINTS[addr]) {
      results.set(addr, KNOWN_MINTS[addr]);
    } else if (resolvedCache.has(addr)) {
      results.set(addr, resolvedCache.get(addr)!);
    } else {
      toFetch.push(addr);
    }
  }

  if (toFetch.length === 0) return results;

  // Derive all PDAs
  const pdaEntries = toFetch.map(addr => {
    const mintPubkey = new PublicKey(addr);
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM.toBuffer(),
        mintPubkey.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM,
    );
    return { mint: addr, pda };
  });

  // Fetch all metadata accounts in one getMultipleAccountsInfo call
  try {
    const pdaKeys = pdaEntries.map(e => e.pda);
    // Batch in groups of 100 (RPC limit)
    for (let i = 0; i < pdaKeys.length; i += 100) {
      const batchKeys = pdaKeys.slice(i, i + 100);
      const batchEntries = pdaEntries.slice(i, i + 100);
      const infos = await connection.getMultipleAccountsInfo(batchKeys);

      for (let j = 0; j < infos.length; j++) {
        const info = infos[j];
        const mint = batchEntries[j].mint;

        if (info && info.data.length > 0) {
          const symbol = parseMetaplexSymbol(info.data);
          if (symbol) {
            resolvedCache.set(mint, symbol);
            results.set(mint, symbol);
            continue;
          }
        }
        // No metadata — cache truncated
        const truncated = `${mint.slice(0, 4)}...${mint.slice(-4)}`;
        resolvedCache.set(mint, truncated);
        results.set(mint, truncated);
      }
    }
  } catch {
    // Batch failed — fall back to truncated for all
    for (const addr of toFetch) {
      if (!results.has(addr)) {
        const truncated = `${addr.slice(0, 4)}...${addr.slice(-4)}`;
        resolvedCache.set(addr, truncated);
        results.set(addr, truncated);
      }
    }
  }

  return results;
}

// ── Metaplex metadata parser ────────────────────────────────────────

/**
 * Parse the symbol field from raw Metaplex Token Metadata account data.
 *
 * Metaplex metadata v1 layout (simplified):
 *   [0]       key (1 byte)
 *   [1..33]   update authority (32 bytes)
 *   [33..65]  mint (32 bytes)
 *   [65..69]  name length (4 bytes LE u32)
 *   [69..69+nameLen] name (variable, padded to 32 bytes... actually uses Borsh string)
 *
 * Borsh string: 4-byte LE length prefix, then UTF-8 bytes.
 * Layout:
 *   offset 1: key
 *   offset 1+32: update_authority
 *   offset 1+32+32: mint
 *   offset 65: name (borsh string: 4-byte len + data)
 *   after name: symbol (borsh string: 4-byte len + data)
 */
function parseMetaplexSymbol(data: Buffer | Uint8Array): string | null {
  try {
    const buf = Buffer.from(data);
    if (buf.length < 70) return null;

    // Skip key (1) + update_authority (32) + mint (32) = 65
    let offset = 65;

    // Read name (borsh string: 4 byte LE length + data)
    if (offset + 4 > buf.length) return null;
    const nameLen = buf.readUInt32LE(offset);
    offset += 4;
    if (nameLen > 200 || offset + nameLen > buf.length) return null;
    offset += nameLen;

    // Read symbol (borsh string: 4 byte LE length + data)
    if (offset + 4 > buf.length) return null;
    const symbolLen = buf.readUInt32LE(offset);
    offset += 4;
    if (symbolLen > 50 || offset + symbolLen > buf.length) return null;

    const raw = buf.slice(offset, offset + symbolLen).toString('utf-8');
    // Metaplex pads with null bytes — strip them
    const symbol = raw.replace(/\0/g, '').trim();

    return symbol.length > 0 ? symbol : null;
  } catch {
    return null;
  }
}
