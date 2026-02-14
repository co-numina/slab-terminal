import { NextResponse } from 'next/server';
import { getSlabMarketData } from '@/lib/fetcher';

/**
 * GET /api/slab/[address]
 *
 * Fetch full market state for a single slab from ANY program/network.
 * This is the backend for the drill-down view.
 */
export async function GET(
  _request: Request,
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

    const detail = await getSlabMarketData(address);

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
