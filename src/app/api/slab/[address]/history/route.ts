import { NextResponse } from 'next/server';
import { getPriceHistory } from '@/lib/price-history';

/**
 * GET /api/slab/[address]/history
 *
 * Returns accumulated price history for a slab.
 * Data is in-memory only — builds up as the slab detail endpoint is polled.
 * Returns up to 360 data points (~1 hour at 10s intervals).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;

  if (!address || address.length < 32) {
    return NextResponse.json(
      { error: 'Invalid slab address' },
      { status: 400 },
    );
  }

  const points = getPriceHistory(address);

  return NextResponse.json(
    { address, points, count: points.length },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10',
      },
    },
  );
}
