import { NextResponse } from 'next/server';
import { CACHE_DURATIONS } from '@/lib/constants';
import { getConnection, getCached, setCache } from '@/lib/connection';
import { getAllMarketData } from '@/lib/fetcher';
import { parseMatcherContext } from '@/lib/matcher';
import { AccountKind } from '@/lib/types';
import type { LPsResponse, LPEntry } from '@/lib/types';

const CACHE_KEY = 'lps_response';

export async function GET() {
  try {
    // Check cache
    const cached = getCached<LPsResponse>(CACHE_KEY, CACHE_DURATIONS.LPS);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
      });
    }

    const connection = getConnection();
    const all = await getAllMarketData();
    const lps: LPEntry[] = [];

    // Discover LPs dynamically across all slabs
    for (const md of all.slabs) {
      const { allAccounts, solUsdPrice, slabPubkey, slabLabel } = md;

      // Find LP accounts in this slab
      const lpAccounts = allAccounts.filter(a => a.account.kind === AccountKind.LP);

      // Fetch matcher contexts for all LPs in this slab in parallel
      const ctxResults = await Promise.all(
        lpAccounts.map(async (lp) => {
          const ctxPubkey = lp.account.matcherContext;
          // Skip if matcher context is all zeros (no matcher)
          const ctxStr = ctxPubkey.toBase58();
          if (ctxStr === '11111111111111111111111111111111') return null;
          try {
            const ctx = await parseMatcherContext(connection, ctxPubkey);
            return { lp, ctx };
          } catch {
            return { lp, ctx: null };
          }
        })
      );

      for (const result of ctxResults) {
        if (!result) continue;
        const { lp, ctx } = result;
        const { idx, account } = lp;

        const collateral = Number(account.capital) / 1e9;
        const pnl = Number(account.pnl) / 1e9;
        const effectiveCapital = Number(account.capital + account.pnl) / 1e9;
        const positionSize = account.positionSize.toString();
        const positionNotional = Number(
          (account.positionSize < 0n ? -account.positionSize : account.positionSize)
        ) / 1e9 * solUsdPrice;

        if (!ctx) {
          lps.push({
            index: idx,
            type: 'passive',
            label: `LP ${idx} (${slabLabel})`,
            slabPubkey: slabPubkey.toBase58(),
            slabLabel,
            collateral,
            pnl,
            effectiveCapital,
            positionSize,
            positionNotional,
            spreadBps: 0,
            tradingFeeBps: 0,
            impactKBps: null,
            maxTotalBps: 0,
            inventory: 0,
            maxInventory: 0,
            utilization: 0,
            lastExecPrice: 0,
            lastOraclePrice: 0,
            liquidityNotional: 0,
          });
          continue;
        }

        const inventory = ctx.inventoryBase;
        const maxInventory = ctx.maxInventoryAbs;
        const utilization = maxInventory > 0
          ? (Math.abs(inventory) / maxInventory) * 100
          : 0;

        const typeLabel = ctx.kind === 'passive' ? 'PASSIVE' : 'vAMM';

        lps.push({
          index: idx,
          type: ctx.kind,
          label: `LP ${idx} — ${typeLabel} (${slabLabel})`,
          slabPubkey: slabPubkey.toBase58(),
          slabLabel,
          collateral,
          pnl,
          effectiveCapital,
          positionSize,
          positionNotional,
          spreadBps: ctx.baseSpreadBps,
          tradingFeeBps: ctx.tradingFeeBps,
          impactKBps: ctx.kind === 'vamm' ? ctx.impactKBps : null,
          maxTotalBps: ctx.maxTotalBps,
          inventory,
          maxInventory,
          utilization,
          lastExecPrice: ctx.lastExecPrice,
          lastOraclePrice: ctx.lastOraclePrice,
          liquidityNotional: ctx.liquidityNotionalE6 / 1e6,
        });
      }
    }

    const response: LPsResponse = {
      lps,
      timestamp: new Date().toISOString(),
    };

    setCache(CACHE_KEY, response);

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
    });
  } catch (error: unknown) {
    console.error('GET /api/lps error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch LP data', details: message },
      { status: 500 },
    );
  }
}
