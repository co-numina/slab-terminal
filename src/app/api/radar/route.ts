/**
 * GET /api/radar — Ecosystem radar scan.
 *
 * Returns health-scored overview of ALL known Percolator programs
 * across devnet and mainnet. Enriches slab entries with resolved
 * token symbols via Jupiter / Metaplex / hardcoded mints.
 */
import { NextResponse } from 'next/server';
import { scanEcosystem } from '@/lib/radar';
import { getNetworkConnection } from '@/lib/connections';
import { resolveMintSymbolsBatch } from '@/lib/known-mints';

export async function GET() {
  try {
    const radar = await scanEcosystem();

    // ── Resolve collateral symbols for all slabs ─────────────────────
    // Collect unique mints per network
    const devnetMints: string[] = [];
    const mainnetMints: string[] = [];
    for (const program of radar.programs) {
      for (const slab of program.slabs) {
        if (!slab.collateralMint) continue;
        if (program.network === 'devnet') devnetMints.push(slab.collateralMint);
        else mainnetMints.push(slab.collateralMint);
      }
    }
    const uniqueDevnet = [...new Set(devnetMints)];
    const uniqueMainnet = [...new Set(mainnetMints)];

    // Resolve in parallel
    const [devnetSymbols, mainnetSymbols] = await Promise.all([
      uniqueDevnet.length > 0
        ? resolveMintSymbolsBatch(uniqueDevnet, getNetworkConnection('devnet'))
        : Promise.resolve(new Map<string, string>()),
      uniqueMainnet.length > 0
        ? resolveMintSymbolsBatch(uniqueMainnet, getNetworkConnection('mainnet'))
        : Promise.resolve(new Map<string, string>()),
    ]);

    // Apply resolved symbols to slab entries
    for (const program of radar.programs) {
      const symbolMap = program.network === 'devnet' ? devnetSymbols : mainnetSymbols;
      for (const slab of program.slabs) {
        if (slab.collateralMint) {
          const resolved = symbolMap.get(slab.collateralMint);
          if (resolved) slab.collateralSymbol = resolved;
        }
      }
    }

    return NextResponse.json(radar, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error: unknown) {
    console.error('GET /api/radar error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Radar scan failed', details: message },
      { status: 500 },
    );
  }
}
