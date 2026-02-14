import { NextResponse } from 'next/server';
import { CONFIG, CACHE_DURATIONS } from '@/lib/constants';
import { getConnection, getCached, setCache } from '@/lib/connection';
import { getMarketData } from '@/lib/fetcher';
import { parseMatcherContext } from '@/lib/matcher';
import { AccountKind } from '@/lib/types';
import type { LPsResponse, LPEntry } from '@/lib/types';

const CACHE_KEY = 'lps_response';

// LP definitions with their known matcher contexts
const LP_CONFIGS = [
  {
    index: 0,
    label: 'LP 0 — PASSIVE',
    ctxPubkey: CONFIG.LP0_MATCHER_CTX,
    pdaPubkey: CONFIG.LP0_PDA,
  },
  {
    index: 4,
    label: 'LP 4 — vAMM',
    ctxPubkey: CONFIG.LP4_MATCHER_CTX,
    pdaPubkey: CONFIG.LP4_PDA,
  },
];

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
    const md = await getMarketData();
    const { allAccounts, solUsdPrice } = md;

    // Fetch matcher contexts in parallel
    const [ctx0, ctx4] = await Promise.all([
      parseMatcherContext(connection, CONFIG.LP0_MATCHER_CTX).catch(() => null),
      parseMatcherContext(connection, CONFIG.LP4_MATCHER_CTX).catch(() => null),
    ]);

    // Find LP accounts in slab
    const lpAccounts = allAccounts.filter(a => a.account.kind === AccountKind.LP);
    const matcherContexts = [ctx0, ctx4];

    const lps: LPEntry[] = LP_CONFIGS.map((lpConfig, i) => {
      const ctx = matcherContexts[i];

      // Find the LP account in the slab
      const lpAccount = lpAccounts.find(
        a => a.account.owner.toBase58() === lpConfig.pdaPubkey.toBase58()
          || a.account.matcherContext.toBase58() === lpConfig.ctxPubkey.toBase58()
      );

      const collateral = lpAccount ? Number(lpAccount.account.capital) / 1e9 : 0;
      const pnl = lpAccount ? Number(lpAccount.account.pnl) / 1e9 : 0;
      const effectiveCapital = lpAccount
        ? Number(lpAccount.account.capital + lpAccount.account.pnl) / 1e9
        : 0;
      const positionSize = lpAccount ? lpAccount.account.positionSize.toString() : '0';
      const positionNotional = lpAccount
        ? Number(
            (lpAccount.account.positionSize < 0n ? -lpAccount.account.positionSize : lpAccount.account.positionSize)
          ) / 1e9 * solUsdPrice
        : 0;

      if (!ctx) {
        return {
          index: lpConfig.index,
          type: lpConfig.index === 0 ? 'passive' : 'vamm' as 'passive' | 'vamm',
          label: lpConfig.label,
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
        };
      }

      const inventory = ctx.inventoryBase;
      const maxInventory = ctx.maxInventoryAbs;
      const utilization = maxInventory > 0
        ? (Math.abs(inventory) / maxInventory) * 100
        : 0;

      return {
        index: lpConfig.index,
        type: ctx.kind,
        label: lpConfig.label,
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
        lastExecPrice: ctx.lastExecPrice,    // Already SOL/USD after inversion in matcher.ts
        lastOraclePrice: ctx.lastOraclePrice, // Already SOL/USD after inversion in matcher.ts
        liquidityNotional: ctx.liquidityNotionalE6 / 1e6,
      };
    });

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
