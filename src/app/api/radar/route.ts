/**
 * GET /api/radar — Ecosystem radar scan.
 *
 * Returns health-scored overview of ALL known Percolator programs
 * across devnet and mainnet. Independent from existing routes.
 */
import { NextResponse } from 'next/server';
import { scanEcosystem } from '@/lib/radar';

export async function GET() {
  try {
    const radar = await scanEcosystem();

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
