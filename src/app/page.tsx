"use client"

import { Header } from "@/components/terminal/header"
import { MarketOverview } from "@/components/terminal/market-overview"
import { LPPerformance } from "@/components/terminal/lp-performance"
import { PositionsTable } from "@/components/terminal/positions-table"
import { LiquidationRisk } from "@/components/terminal/liquidation-risk"
import { ActivityFeed } from "@/components/terminal/activity-feed"
import { Footer } from "@/components/terminal/footer"

export default function Dashboard() {
  return (
    <div className="scanlines flex min-h-screen flex-col bg-[var(--terminal-bg)]">
      <Header />

      <main className="flex flex-1 flex-col gap-px p-1 lg:p-1.5">
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
      </main>

      <Footer />
    </div>
  )
}
