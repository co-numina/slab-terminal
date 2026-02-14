/**
 * Known token mint address → symbol mapping.
 * Used to resolve collateral mints to human-readable symbols.
 */
export const KNOWN_MINTS: Record<string, string> = {
  'So11111111111111111111111111111111111111112': 'SOL',
  'A16Gd8AfaPnG6rohE6iPFDf6mr9gk519d6aMUJAperc': 'PERC',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
};

export function resolveMintSymbol(mintAddress: string): string {
  return KNOWN_MINTS[mintAddress] ?? `${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`;
}
