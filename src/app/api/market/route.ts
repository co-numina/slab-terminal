import { NextResponse } from 'next/server';
import { CACHE_DURATIONS } from '@/lib/constants';
import { getCached, setCache } from '@/lib/connection';
import { calculateFundingRate } from '@/lib/percolator';
import { getMarketData } from '@/lib/fetcher';
import { recordSnapshot } from '@/lib/activity';
import type { MarketResponse } from '@/lib/types';

const CACHE_KEY = 'market_response';

export async function GET() {
  try {
    // Check cache
    const cached = getCached<MarketResponse>(CACHE_KEY, CACHE_DURATIONS.MARKET);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' },
      });
    }

    const md = await getMarketData();
    const { config, params, engine, allAccounts, oraclePriceE6, solUsdPrice, slot, vaultBalanceSol } = md;

    // Funding rate
    const funding = calculateFundingRate(engine, config, oraclePriceE6);

    // Open interest in SOL
    const openInterest = Number(engine.totalOpenInterest * oraclePriceE6 / 1_000_000n) / 1e9;

    // Record snapshot for activity feed
    try {
      recordSnapshot(engine, allAccounts);
    } catch {
      // Non-critical
    }

    const response: MarketResponse = {
      oraclePrice: solUsdPrice,
      oraclePriceRaw: oraclePriceE6.toString(),
      invertedMarket: config.invert === 1,
      slot,
      lastCrankSlot: Number(engine.lastCrankSlot),
      tvl: vaultBalanceSol,
      insuranceFund: Number(engine.insuranceFund.balance) / 1e9,
      insuranceFeeRevenue: Number(engine.insuranceFund.feeRevenue) / 1e9,
      openInterest,
      openInterestUnits: engine.totalOpenInterest.toString(),
      fundingRate: funding.rateBpsPerHour,
      fundingRateBpsPerSlot: funding.rateBpsPerSlot,
      fundingRateBpsPerHour: funding.rateBpsPerHour,
      fundingRateDirection: funding.direction,
      maintenanceMarginBps: Number(params.maintenanceMarginBps),
      initialMarginBps: Number(params.initialMarginBps),
      tradingFeeBps: Number(params.tradingFeeBps),
      liquidationFeeBps: Number(params.liquidationFeeBps),
      numAccounts: engine.numUsedAccounts,
      lifetimeLiquidations: Number(engine.lifetimeLiquidations),
      lifetimeForceCloses: Number(engine.lifetimeForceCloses),
      lastEffectivePriceE6: config.lastEffectivePriceE6.toString(),
      timestamp: new Date().toISOString(),
    };

    setCache(CACHE_KEY, response);

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' },
    });
  } catch (error: unknown) {
    console.error('GET /api/market error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch market data', details: message },
      { status: 500 },
    );
  }
}
