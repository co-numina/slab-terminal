"use client"

import { useEcosystem } from "@/hooks/use-ecosystem"
import { EcosystemOverview } from "../home/ecosystem-overview"
import { TVLDistribution } from "../home/tvl-distribution"
import { PositionBalance } from "../home/position-balance"
import { CrankHeartbeat } from "../home/crank-heartbeat"
import { TopMarkets } from "../home/top-markets"
import { SlabUtilization } from "../home/slab-utilization"
import { LiquidationWatch } from "../home/liquidation-watch"
import { InsuranceReserves } from "../home/insurance-reserves"
import { NetworkBreakdown } from "../home/network-breakdown"
import { MarketTreemap } from "../home/market-treemap"
import { TerminalPanel } from "../terminal-panel"

/** Skeleton placeholder for panels that need ecosystem data */
function PanelSkeleton({ title }: { title: string }) {
  return (
    <TerminalPanel title={title}>
      <div className="flex items-center justify-center py-4">
        <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
        <span className="ml-2 text-[10px] text-[var(--terminal-dim)]">LOADING...</span>
      </div>
    </TerminalPanel>
  )
}

export function HomeView() {
  const { data } = useEcosystem()

  return (
    <div className="flex flex-col gap-px">
      {/* Row 1: Ecosystem Overview — stat cards */}
      {data ? <EcosystemOverview data={data} /> : <PanelSkeleton title="Ecosystem Overview" />}

      {/* Row 2: TVL Distribution Bar + Position Balance Gauge (thin visual row) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
        {data ? <TVLDistribution data={data} /> : <PanelSkeleton title="TVL Distribution" />}
        {data ? <PositionBalance data={data} /> : <PanelSkeleton title="Ecosystem Sentiment" />}
      </div>

      {/* Row 3: Crank Heartbeat + Top Markets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
        {data ? (
          <CrankHeartbeat programs={data.programSummaries} />
        ) : (
          <PanelSkeleton title="Crank Heartbeat" />
        )}
        <TopMarkets />
      </div>

      {/* Row 4: Slab Utilization + Liquidation Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
        {data ? (
          <SlabUtilization programs={data.programSummaries} />
        ) : (
          <PanelSkeleton title="Slab Utilization" />
        )}
        <LiquidationWatch />
      </div>

      {/* Row 5: Insurance Reserves + Network Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
        {data ? (
          <InsuranceReserves programs={data.programSummaries} />
        ) : (
          <PanelSkeleton title="Insurance Reserves" />
        )}
        {data ? (
          <NetworkBreakdown data={data} />
        ) : (
          <PanelSkeleton title="Network Breakdown" />
        )}
      </div>

      {/* Row 6: Market Treemap (full width) */}
      <MarketTreemap />
    </div>
  )
}
