import { NextResponse } from 'next/server';
import { CACHE_DURATIONS } from '@/lib/constants';
import { getCached, setCache } from '@/lib/connection';
import { getMarketData } from '@/lib/fetcher';
import { getEvents, recordSnapshot } from '@/lib/activity';
import type { ActivityResponse } from '@/lib/types';

const CACHE_KEY = 'activity_response';

export async function GET() {
  try {
    // Check cache
    const cached = getCached<ActivityResponse>(CACHE_KEY, CACHE_DURATIONS.ACTIVITY);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' },
      });
    }

    const md = await getMarketData();
    const { engine, allAccounts } = md;

    // Record current snapshot (diffs against previous, generates events)
    recordSnapshot(engine, allAccounts);

    let events = getEvents();

    // If no events yet, add an info event
    if (events.length === 0) {
      events = [{
        timestamp: new Date().toISOString(),
        type: 'info',
        details: `Market active: ${engine.numUsedAccounts} accounts, last crank slot ${engine.lastCrankSlot.toString()}`,
        severity: 'normal',
      }];
    }

    const response: ActivityResponse = {
      events,
      timestamp: new Date().toISOString(),
    };

    setCache(CACHE_KEY, response);

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' },
    });
  } catch (error: unknown) {
    console.error('GET /api/activity error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch activity', details: message },
      { status: 500 },
    );
  }
}
