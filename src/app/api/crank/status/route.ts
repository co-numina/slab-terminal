/**
 * GET /api/crank/status — Return crank bot status.
 *
 * When the bot is "on", this endpoint also acts as the heartbeat:
 * it auto-fires a crank if enough time has elapsed since the last one.
 * The frontend's SWR polling (every 3s) drives the crank cadence.
 */
import { NextResponse } from 'next/server';
import { getCrankBotStatus, maybeCrankOnPoll } from '@/lib/crank';

export async function GET() {
  try {
    // Heartbeat: auto-crank if bot is on and interval has elapsed
    await maybeCrankOnPoll();

    const status = await getCrankBotStatus();

    return NextResponse.json(status, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
  } catch (error: unknown) {
    console.error('GET /api/crank/status error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to get crank status', details: message },
      { status: 500 },
    );
  }
}
