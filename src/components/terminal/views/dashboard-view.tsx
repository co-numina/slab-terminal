"use client"

import { MarketOverview } from "@/components/terminal/market-overview"
import { LPPerformance } from "@/components/terminal/lp-performance"
import { PositionsTable } from "@/components/terminal/positions-table"
import { LiquidationRisk } from "@/components/terminal/liquidation-risk"
import { ActivityFeed } from "@/components/terminal/activity-feed"
import { CrankControl } from "@/components/terminal/crank-control"

export function DashboardView() {
  return (
    <>
      {/* Crank Bot Control */}
      <CrankControl />

      {/* Row 1: Market Overview + LP Performance */}
      <div className="grid grid-cols-1 gap-px lg:grid-cols-2">
        <MarketOverview />
        <LPPerformance />
      </div>

      {/* Row 2: Positions Table */}
      <PositionsTable />

      {/* Row 3: Liquidation Risk + Activity Feed */}
      <div className="grid grid-cols-1 gap-px lg:grid-cols-2">
        <LiquidationRisk />
        <ActivityFeed />
      </div>
    </>
  )
}
