"use client"

import { useEcosystem } from "@/hooks/use-ecosystem"
import { EcosystemOverview } from "../home/ecosystem-overview"
import { ProgramStatus } from "../home/program-status"
import { TopMarkets } from "../home/top-markets"
import { LiquidationWatch } from "../home/liquidation-watch"
import { NetworkBreakdown } from "../home/network-breakdown"

export function HomeView() {
  const { data, isLoading } = useEcosystem()

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
        <span className="ml-2 text-sm text-[var(--terminal-dim)]">INITIALIZING SLAB SCOPE...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-px">
      {/* Row 1: Ecosystem Overview (full width) */}
      <EcosystemOverview data={data} />

      {/* Row 2: Program Status + Top Markets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
        <ProgramStatus programs={data.programSummaries} />
        <TopMarkets />
      </div>

      {/* Row 3: Liquidation Watchlist + Network Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
        <LiquidationWatch />
        <NetworkBreakdown data={data} />
      </div>
    </div>
  )
}
