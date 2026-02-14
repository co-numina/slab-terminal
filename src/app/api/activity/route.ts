import { NextResponse } from 'next/server';
import { CACHE_DURATIONS } from '@/lib/constants';
import { getCached, setCache } from '@/lib/connection';
import { getAllMarketData } from '@/lib/fetcher';
import { getEvents, recordSnapshot } from '@/lib/activity';
import type { ActivityResponse } from '@/lib/types';

const CACHE_KEY = 'activity_response';

export async function GET() {
  try {
    // Check cache
    const cached = getCached<ActivityResponse>(CACHE_KEY, CACHE_DURATIONS.ACTIVITY);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' },
      });
    }

    const all = await getAllMarketData();

    // Record snapshots for all slabs
    for (const md of all.slabs) {
      try {
        recordSnapshot(md.slabLabel, md.engine, md.allAccounts);
      } catch {
        // Non-critical
      }
    }

    const response: ActivityResponse = {
      events: getEvents(),
      timestamp: new Date().toISOString(),
    };

    setCache(CACHE_KEY, response);

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' },
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
