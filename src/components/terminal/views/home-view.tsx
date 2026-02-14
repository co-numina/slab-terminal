"use client"

import { useEcosystem } from "@/hooks/use-ecosystem"
import { EcosystemOverview } from "../home/ecosystem-overview"
import { ProgramStatus } from "../home/program-status"
import { TVLDistribution } from "../home/tvl-distribution"
import { PositionBalance } from "../home/position-balance"
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
      {/* Row 1: Ecosystem Overview + Program Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
        {data ? <EcosystemOverview data={data} /> : <PanelSkeleton title="Ecosystem Overview" />}
        {data ? (
          <ProgramStatus programs={data.programSummaries} />
        ) : (
          <PanelSkeleton title="Program Status" />
        )}
      </div>

      {/* Row 2: TVL Distribution Bar + Position Balance Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
        {data ? <TVLDistribution data={data} /> : <PanelSkeleton title="TVL Distribution" />}
        {data ? <PositionBalance data={data} /> : <PanelSkeleton title="Ecosystem Sentiment" />}
      </div>

      {/* Row 3: Top Markets + Slab Utilization */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
        <TopMarkets />
        {data ? (
          <SlabUtilization programs={data.programSummaries} />
        ) : (
          <PanelSkeleton title="Slab Utilization" />
        )}
      </div>

      {/* Row 4: Liquidation Watchlist + Insurance Reserves */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
        <LiquidationWatch />
        {data ? (
          <InsuranceReserves programs={data.programSummaries} />
        ) : (
          <PanelSkeleton title="Insurance Reserves" />
        )}
      </div>

      {/* Row 5: Network Breakdown + Market Treemap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
        {data ? (
          <NetworkBreakdown data={data} />
        ) : (
          <PanelSkeleton title="Network Breakdown" />
        )}
        <MarketTreemap />
      </div>
    </div>
  )
}
