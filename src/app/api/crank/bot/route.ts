/**
 * POST /api/crank/bot — Start or stop the crank bot.
 *
 * Body: { action: "start" | "stop", intervalMs?: number }
 * Response: current bot status
 */
import { NextRequest, NextResponse } from 'next/server';
import { startCrankBot, stopCrankBot, getCrankBotStatus } from '@/lib/crank';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, intervalMs } = body as { action: string; intervalMs?: number };

    if (action === 'start') {
      startCrankBot(intervalMs);
    } else if (action === 'stop') {
      stopCrankBot();
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "start" or "stop".' },
        { status: 400 },
      );
    }

    const status = await getCrankBotStatus();
    return NextResponse.json(status);
  } catch (error: unknown) {
    console.error('POST /api/crank/bot error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to control crank bot', details: message },
      { status: 500 },
    );
  }
}
