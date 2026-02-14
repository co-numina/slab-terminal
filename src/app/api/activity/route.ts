import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { CACHE_DURATIONS } from '@/lib/constants';
import { getConnection, getCached, setCache } from '@/lib/connection';
import { getAllMarketData } from '@/lib/fetcher';
import { getEvents, recordSnapshot } from '@/lib/activity';
import type { ActivityResponse, ActivityEvent } from '@/lib/types';

const CACHE_KEY = 'activity_response';
const TX_HISTORY_CACHE_KEY = 'tx_history';

/**
 * Fetch recent transaction signatures for slabs as fallback activity.
 */
async function fetchRecentTransactions(
  slabPubkeys: { pubkey: string; label: string }[],
  limit = 20,
): Promise<ActivityEvent[]> {
  const cached = getCached<ActivityEvent[]>(TX_HISTORY_CACHE_KEY, 30_000);
  if (cached) return cached;

  const connection = getConnection();
  const events: ActivityEvent[] = [];

  // Query at most 3 slabs to avoid too many RPC calls
  const slabsToQuery = slabPubkeys.slice(0, 3);

  for (const { pubkey, label } of slabsToQuery) {
    try {
      const signatures = await connection.getSignaturesForAddress(
        new PublicKey(pubkey),
        { limit },
      );

      for (const sig of signatures) {
        const ts = sig.blockTime
          ? new Date(sig.blockTime * 1000).toISOString()
          : new Date().toISOString();

        let type: ActivityEvent['type'] = 'info';
        let details = `[${label}] tx ${sig.signature.slice(0, 8)}...`;
        let severity: ActivityEvent['severity'] = 'normal';

        if (sig.err) {
          type = 'info';
          details = `[${label}] Failed tx: ${sig.signature.slice(0, 8)}...`;
          severity = 'warning';
        } else {
          type = 'info';
          details = `[${label}] Slab transaction`;
        }

        events.push({
          timestamp: ts,
          type,
          details,
          severity,
          signature: sig.signature,
          slabLabel: label,
        });
      }
    } catch (err) {
      console.warn(`Failed to fetch tx history for ${label}: ${err}`);
    }
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const trimmed = events.slice(0, 50);
  setCache(TX_HISTORY_CACHE_KEY, trimmed);
  return trimmed;
}

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

    let events = getEvents();

    // Fall back to transaction history if no state-diff events
    if (events.length === 0) {
      const slabInfos = all.slabs.map(s => ({
        pubkey: s.slabPubkey.toBase58(),
        label: s.slabLabel,
      }));
      events = await fetchRecentTransactions(slabInfos);
    }

    const response: ActivityResponse = {
      events,
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
