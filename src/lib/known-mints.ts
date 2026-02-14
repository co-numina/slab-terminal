/**
 * Token mint address → symbol resolution.
 *
 * Resolution order:
 *   1. Hardcoded map (SOL, PERC, USDC, USDT)
 *   2. In-memory cache (survives across requests in same process)
 *   3. Jupiter Token API — https://tokens.jup.ag/token/<MINT>
 *      (same approach used by percolator-sov frontend)
 *   4. Metaplex Token Metadata PDA on-chain
 *   5. Truncated address fallback
 */
import { PublicKey, type Connection } from '@solana/web3.js';

// ── Hardcoded well-known mints ──────────────────────────────────────

export const KNOWN_MINTS: Record<string, string> = {
  'So11111111111111111111111111111111111111112': 'SOL',
  'A16Gd8AfaPnG6rohE6iPFDf6mr9gk519d6aMUJAperc': 'PERC',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
};

// ── In-memory cache for resolved mints (survives across requests) ───

const resolvedCache = new Map<string, string>();

// Metaplex Token Metadata Program
const TOKEN_METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

/**
 * Synchronous — uses hardcoded map + runtime cache only.
 */
export function resolveMintSymbol(mintAddress: string): string {
  if (KNOWN_MINTS[mintAddress]) return KNOWN_MINTS[mintAddress];
  if (resolvedCache.has(mintAddress)) return resolvedCache.get(mintAddress)!;
  return `${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`;
}

// ── Jupiter Token API ───────────────────────────────────────────────

interface JupiterTokenResponse {
  symbol?: string;
  name?: string;
  decimals?: number;
}

/**
 * Fetch token symbol from Jupiter Token API.
 * Returns null if the token isn't indexed or the request fails.
 */
async function fetchJupiterSymbol(mintAddress: string): Promise<string | null> {
  try {
    const res = await fetch(`https://tokens.jup.ag/token/${mintAddress}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as JupiterTokenResponse;
    const symbol = data.symbol?.trim();
    return symbol && symbol.length > 0 ? symbol : null;
  } catch {
    return null;
  }
}

/**
 * Batch-fetch symbols from Jupiter for multiple mints.
 * Jupiter doesn't have a batch endpoint, so we fire parallel requests
 * but cap concurrency to avoid hammering them.
 */
async function fetchJupiterSymbolsBatch(
  mints: string[],
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  // Cap at 10 concurrent requests
  for (let i = 0; i < mints.length; i += 10) {
    const batch = mints.slice(i, i + 10);
    const settled = await Promise.allSettled(
      batch.map(async (mint) => {
        const symbol = await fetchJupiterSymbol(mint);
        return { mint, symbol };
      }),
    );
    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value.symbol) {
        results.set(result.value.mint, result.value.symbol);
      }
    }
  }
  return results;
}

// ── Metaplex metadata parser ────────────────────────────────────────

/**
 * Parse the symbol field from raw Metaplex Token Metadata account data.
 *
 * Borsh layout:
 *   offset 0:  key (1 byte)
 *   offset 1:  update_authority (32 bytes)
 *   offset 33: mint (32 bytes)
 *   offset 65: name (borsh string: 4-byte LE length + UTF-8 data)
 *   after name: symbol (borsh string: 4-byte LE length + UTF-8 data)
 */
function parseMetaplexSymbol(data: Buffer | Uint8Array): string | null {
  try {
    const buf = Buffer.from(data);
    if (buf.length < 70) return null;

    let offset = 65; // skip key + update_authority + mint

    // Read name (borsh string)
    if (offset + 4 > buf.length) return null;
    const nameLen = buf.readUInt32LE(offset);
    offset += 4;
    if (nameLen > 200 || offset + nameLen > buf.length) return null;
    offset += nameLen;

    // Read symbol (borsh string)
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

// ── Batch resolver (main entry point) ───────────────────────────────

/**
 * Batch-resolve multiple mint addresses to symbols.
 *
 * Resolution chain per mint:
 *   1. Hardcoded KNOWN_MINTS
 *   2. In-memory resolvedCache
 *   3. Jupiter Token API (parallel, capped at 10 concurrent)
 *   4. Metaplex Token Metadata PDA (single getMultipleAccountsInfo)
 *   5. Truncated address fallback
 *
 * All resolved symbols are cached in memory for the process lifetime.
 */
export async function resolveMintSymbolsBatch(
  mintAddresses: string[],
  connection: Connection,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const toFetch: string[] = [];

  // Phase 1: check hardcoded + cache
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

  // Phase 2: try Jupiter Token API first (fast, covers most tokens)
  const jupiterResults = await fetchJupiterSymbolsBatch(toFetch);
  const stillUnresolved: string[] = [];

  for (const addr of toFetch) {
    const jupSymbol = jupiterResults.get(addr);
    if (jupSymbol) {
      resolvedCache.set(addr, jupSymbol);
      results.set(addr, jupSymbol);
    } else {
      stillUnresolved.push(addr);
    }
  }

  if (stillUnresolved.length === 0) return results;

  // Phase 3: try Metaplex metadata on-chain for remaining
  try {
    const pdaEntries = stillUnresolved.map(addr => {
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

    // Batch in groups of 100 (RPC limit)
    for (let i = 0; i < pdaEntries.length; i += 100) {
      const batchEntries = pdaEntries.slice(i, i + 100);
      const batchKeys = batchEntries.map(e => e.pda);
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
        // Phase 4: fallback — truncated address
        const truncated = `${mint.slice(0, 4)}...${mint.slice(-4)}`;
        resolvedCache.set(mint, truncated);
        results.set(mint, truncated);
      }
    }
  } catch {
    // Metaplex batch failed — fall back to truncated for all
    for (const addr of stillUnresolved) {
      if (!results.has(addr)) {
        const truncated = `${addr.slice(0, 4)}...${addr.slice(-4)}`;
        resolvedCache.set(addr, truncated);
        results.set(addr, truncated);
      }
    }
  }

  return results;
}
