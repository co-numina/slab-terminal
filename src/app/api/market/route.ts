import { NextResponse } from 'next/server';
import { CACHE_DURATIONS, CONFIG } from '@/lib/constants';
import { getCached, setCache } from '@/lib/connection';
import { calculateFundingRate } from '@/lib/percolator';
import { getAllMarketData } from '@/lib/fetcher';
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

    const all = await getAllMarketData();
    const { slabs, solUsdPrice, oraclePriceE6, slot } = all;

    if (slabs.length === 0) {
      return NextResponse.json({ error: 'No active slabs' }, { status: 503 });
    }

    // Aggregate across all slabs
    let totalTvl = 0;
    let totalInsuranceFund = 0;
    let totalInsuranceFeeRevenue = 0;
    let totalOpenInterest = 0;
    let totalNumAccounts = 0;
    let totalLifetimeLiquidations = 0;
    let totalLifetimeForceCloses = 0;
    let mostRecentCrankSlot = 0;

    // For weighted-avg funding rate
    let fundingWeightedSum = 0;
    let fundingTvlSum = 0;
    let fundingDirectionCounts = { longs_pay: 0, shorts_pay: 0, neutral: 0 };

    // Use most permissive margin/fee params across slabs
    let minMaintenanceMarginBps = Infinity;
    let minInitialMarginBps = Infinity;
    let minTradingFeeBps = Infinity;
    let minLiquidationFeeBps = Infinity;

    for (const md of slabs) {
      const { config, params, engine, allAccounts } = md;

      // Funding rate per slab
      const funding = calculateFundingRate(engine, config, oraclePriceE6);

      // Open interest in SOL
      const oi = Number(engine.totalOpenInterest * oraclePriceE6 / 1_000_000n) / 1e9;

      totalTvl += md.vaultBalanceSol;
      totalInsuranceFund += Number(engine.insuranceFund.balance) / 1e9;
      totalInsuranceFeeRevenue += Number(engine.insuranceFund.feeRevenue) / 1e9;
      totalOpenInterest += oi;
      totalNumAccounts += engine.numUsedAccounts;
      totalLifetimeLiquidations += Number(engine.lifetimeLiquidations);
      totalLifetimeForceCloses += Number(engine.lifetimeForceCloses);

      const crankSlot = Number(engine.lastCrankSlot);
      if (crankSlot > mostRecentCrankSlot) mostRecentCrankSlot = crankSlot;

      // Weighted funding rate (by TVL)
      if (md.vaultBalanceSol > 0) {
        fundingWeightedSum += funding.rateBpsPerHour * md.vaultBalanceSol;
        fundingTvlSum += md.vaultBalanceSol;
      }
      fundingDirectionCounts[funding.direction]++;

      // Min margin/fee params
      const maint = Number(params.maintenanceMarginBps);
      const init = Number(params.initialMarginBps);
      const tradeFee = Number(params.tradingFeeBps);
      const liqFee = Number(params.liquidationFeeBps);
      if (maint < minMaintenanceMarginBps) minMaintenanceMarginBps = maint;
      if (init < minInitialMarginBps) minInitialMarginBps = init;
      if (tradeFee < minTradingFeeBps) minTradingFeeBps = tradeFee;
      if (liqFee < minLiquidationFeeBps) minLiquidationFeeBps = liqFee;

      // Record snapshot for activity feed
      try {
        recordSnapshot(md.slabLabel, engine, allAccounts);
      } catch {
        // Non-critical
      }
    }

    const avgFundingRate = fundingTvlSum > 0 ? fundingWeightedSum / fundingTvlSum : 0;

    // Majority funding direction
    let fundingRateDirection: 'longs_pay' | 'shorts_pay' | 'neutral' = 'neutral';
    if (fundingDirectionCounts.longs_pay > fundingDirectionCounts.shorts_pay) {
      fundingRateDirection = 'longs_pay';
    } else if (fundingDirectionCounts.shorts_pay > fundingDirectionCounts.longs_pay) {
      fundingRateDirection = 'shorts_pay';
    }

    const response: MarketResponse = {
      oraclePrice: solUsdPrice,
      oraclePriceRaw: oraclePriceE6.toString(),
      invertedMarket: slabs[0].config.invert === 1,
      slot,
      lastCrankSlot: mostRecentCrankSlot,
      tvl: totalTvl,
      insuranceFund: totalInsuranceFund,
      insuranceFeeRevenue: totalInsuranceFeeRevenue,
      openInterest: totalOpenInterest,
      openInterestUnits: '0', // Aggregate not meaningful as raw units
      fundingRate: avgFundingRate,
      fundingRateBpsPerSlot: avgFundingRate / 3600 * 0.4, // approximate
      fundingRateBpsPerHour: avgFundingRate,
      fundingRateDirection,
      maintenanceMarginBps: minMaintenanceMarginBps === Infinity ? 0 : minMaintenanceMarginBps,
      initialMarginBps: minInitialMarginBps === Infinity ? 0 : minInitialMarginBps,
      tradingFeeBps: minTradingFeeBps === Infinity ? 0 : minTradingFeeBps,
      liquidationFeeBps: minLiquidationFeeBps === Infinity ? 0 : minLiquidationFeeBps,
      numAccounts: totalNumAccounts,
      numSlabs: slabs.length,
      lifetimeLiquidations: totalLifetimeLiquidations,
      lifetimeForceCloses: totalLifetimeForceCloses,
      lastEffectivePriceE6: slabs[0].config.lastEffectivePriceE6.toString(),
      timestamp: new Date().toISOString(),
      // Explorer link pubkeys
      programId: CONFIG.PROGRAM_ID.toBase58(),
      slabAddresses: slabs.map(s => s.slabPubkey.toBase58()),
      vaultAddresses: slabs.map(s => s.config.vaultPubkey.toBase58()),
      oracleAddress: CONFIG.ORACLE.toBase58(),
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
