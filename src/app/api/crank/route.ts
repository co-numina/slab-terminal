/**
 * POST /api/crank — Execute a single keeper crank.
 *
 * Body (optional): { slab?: string }
 * Response: { success: true, signature: string, slot: number }
 *
 * Rate-limited: max 1 crank per 2 seconds.
 */
import { NextRequest, NextResponse } from 'next/server';
import { executeCrank } from '@/lib/crank';

let lastCrankTime = 0;
const MIN_INTERVAL_MS = 2000;

export async function POST(request: NextRequest) {
  try {
    // Rate limit
    const now = Date.now();
    if (now - lastCrankTime < MIN_INTERVAL_MS) {
      return NextResponse.json(
        { error: 'Rate limited — max 1 crank per 2 seconds', retryAfterMs: MIN_INTERVAL_MS - (now - lastCrankTime) },
        { status: 429 },
      );
    }

    // Parse optional body
    let slabPubkey: string | undefined;
    try {
      const body = await request.json();
      slabPubkey = body?.slab;
    } catch {
      // No body or invalid JSON — use default slab
    }

    lastCrankTime = Date.now();
    const result = await executeCrank(slabPubkey);

    return NextResponse.json({
      success: true,
      signature: result.signature,
      slot: result.slot,
    });
  } catch (error: unknown) {
    console.error('POST /api/crank error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Crank failed', details: message },
      { status: 500 },
    );
  }
}
