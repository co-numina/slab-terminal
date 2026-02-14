import { NextResponse } from 'next/server';
import { CACHE_DURATIONS } from '@/lib/constants';
import { getCached, setCache } from '@/lib/connection';
import { computeMarginMetrics, estimateLiquidationPrice } from '@/lib/percolator';
import { getMarketData } from '@/lib/fetcher';
import { AccountKind } from '@/lib/types';
import type { PositionsResponse, PositionEntry } from '@/lib/types';

const CACHE_KEY = 'positions_response';

export async function GET() {
  try {
    // Check cache
    const cached = getCached<PositionsResponse>(CACHE_KEY, CACHE_DURATIONS.POSITIONS);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' },
      });
    }

    const md = await getMarketData();
    const { params, allAccounts, oraclePriceE6, solUsdPrice } = md;

    const positions: PositionEntry[] = [];

    for (const { idx, account } of allAccounts) {
      const metrics = computeMarginMetrics(account, oraclePriceE6, params);
      const liqPriceE6 = estimateLiquidationPrice(account, params);

      // Convert liquidation price from inverted e6 to SOL/USD
      const liquidationPrice = liqPriceE6 > 0 ? 1_000_000 / liqPriceE6 : 0;

      // Entry price: inverted e6 → SOL/USD
      const entryPrice = Number(account.entryPrice) > 0
        ? 1_000_000 / Number(account.entryPrice)
        : 0;

      const markPrice = solUsdPrice;
      const notionalSol = Number(metrics.notionalLamports) / 1e9;
      const collateral = Number(account.capital) / 1e9;
      const unrealizedPnlSol = Number(metrics.unrealizedPnl) / 1e9;
      const unrealizedPnlPercent = collateral > 0
        ? (unrealizedPnlSol / collateral) * 100
        : 0;

      // Side determination for INVERTED market:
      // positive positionSize = long inverted = SHORT SOL
      // negative positionSize = short inverted = LONG SOL
      let side: 'long' | 'short' | 'flat';
      if (account.positionSize === 0n) {
        side = 'flat';
      } else if (account.positionSize > 0n) {
        side = 'short';
      } else {
        side = 'long';
      }

      positions.push({
        accountIndex: idx,
        accountId: account.accountId.toString(),
        owner: account.owner.toBase58(),
        side,
        size: notionalSol,
        rawSize: account.positionSize.toString(),
        entryPrice,
        entryPriceE6: account.entryPrice.toString(),
        markPrice,
        unrealizedPnl: unrealizedPnlSol,
        realizedPnl: Number(account.pnl) / 1e9,
        unrealizedPnlPercent,
        collateral,
        effectiveCapital: Number(metrics.effectiveCapital) / 1e9,
        marginHealth: metrics.health,
        marginRatioBps: metrics.marginRatioBps,
        liquidationPrice,
        isLP: account.kind === AccountKind.LP,
        status: metrics.status,
      });
    }

    const longs = positions.filter(p => p.side === 'long');
    const shorts = positions.filter(p => p.side === 'short');

    const response: PositionsResponse = {
      positions,
      count: positions.length,
      summary: {
        totalLongs: longs.length,
        totalShorts: shorts.length,
        totalLongNotional: longs.reduce((sum, p) => sum + p.size, 0),
        totalShortNotional: shorts.reduce((sum, p) => sum + p.size, 0),
        liquidatable: positions.filter(p => p.status === 'liquidatable').length,
        atRisk: positions.filter(p => p.status === 'at_risk').length,
      },
      timestamp: new Date().toISOString(),
    };

    setCache(CACHE_KEY, response);

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' },
    });
  } catch (error: unknown) {
    console.error('GET /api/positions error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch positions', details: message },
      { status: 500 },
    );
  }
}
