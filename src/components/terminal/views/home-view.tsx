"use client"

import { useEcosystem } from "@/hooks/use-ecosystem"
import { EcosystemOverview } from "../home/ecosystem-overview"
import { ProgramStatus } from "../home/program-status"
import { TopMarkets } from "../home/top-markets"
import { EcosystemVitals } from "../home/ecosystem-vitals"
import { SlabUtilization } from "../home/slab-utilization"
import { RiskMonitor } from "../home/risk-monitor"
import { NetworkBreakdown } from "../home/network-breakdown"
import { MarketTreemap } from "../home/market-treemap"
import { RecentActivity } from "../home/recent-activity"
import { TerminalPanel } from "../terminal-panel"

/** Skeleton placeholder for panels that need ecosystem data */
function PanelSkeleton({ title }: { title: string }) {
  return (
    <TerminalPanel title={title}>
      <div className="flex items-center justify-center py-3">
        <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
        <span className="ml-2 text-[9px] text-[var(--terminal-dim)]">LOADING...</span>
      </div>
    </TerminalPanel>
  )
}

export function HomeView() {
  const { data } = useEcosystem()

  return (
    <div className="flex flex-col gap-px">
      {/* Row 1: Ecosystem Overview (full width) */}
      {data ? <EcosystemOverview data={data} /> : <PanelSkeleton title="Ecosystem Overview" />}

      {/* Row 2: Program Status (~45%) | Top Markets (~55%) */}
      <div className="grid grid-cols-1 lg:grid-cols-[45fr_55fr] gap-px">
        {data ? (
          <ProgramStatus programs={data.programSummaries} />
        ) : (
          <PanelSkeleton title="Program Status" />
        )}
        <TopMarkets />
      </div>

      {/* Row 3: Ecosystem Vitals (~45%) | Slab Utilization (~55%) */}
      <div className="grid grid-cols-1 lg:grid-cols-[45fr_55fr] gap-px">
        {data ? <EcosystemVitals data={data} /> : <PanelSkeleton title="Ecosystem Vitals" />}
        {data ? (
          <SlabUtilization programs={data.programSummaries} />
        ) : (
          <PanelSkeleton title="Slab Utilization" />
        )}
      </div>

      {/* Row 4: Risk Monitor (~45%) | Network Breakdown (~55%) */}
      <div className="grid grid-cols-1 lg:grid-cols-[45fr_55fr] gap-px">
        <RiskMonitor />
        {data ? (
          <NetworkBreakdown data={data} />
        ) : (
          <PanelSkeleton title="Network Breakdown" />
        )}
      </div>

      {/* Row 5: Recent Activity (full width) */}
      <RecentActivity />

      {/* Row 6: Market Landscape (full width) */}
      <MarketTreemap />
    </div>
  )
}
