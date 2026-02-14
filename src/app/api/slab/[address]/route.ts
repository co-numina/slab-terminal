import { NextResponse } from 'next/server';
import { getSlabMarketData } from '@/lib/fetcher';
import type { NetworkId } from '@/lib/registry';

/**
 * GET /api/slab/[address]?programId=...&network=devnet|mainnet
 *
 * Fetch full market state for a single slab from ANY program/network.
 * This is the backend for the drill-down view.
 *
 * Performance: when callers pass `programId` + `network` query params,
 * we skip the expensive resolveSlabProgram() step (which tries each
 * network sequentially). The frontend already has this info from
 * radar/top-markets data.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  try {
    const { address } = await params;

    if (!address || address.length < 32) {
      return NextResponse.json(
        { error: 'Invalid slab address' },
        { status: 400 },
      );
    }

    // Extract optional hints from query params
    const { searchParams } = new URL(request.url);
    const programId = searchParams.get('programId') ?? undefined;
    const network = searchParams.get('network') as NetworkId | undefined;

    const detail = await getSlabMarketData(address, {
      programId,
      network,
    });

    return NextResponse.json(detail, {
      headers: {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10',
      },
    });
  } catch (error: unknown) {
    console.error('GET /api/slab/[address] error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json(
      { error: 'Failed to fetch slab data', details: message },
      { status },
    );
  }
}
