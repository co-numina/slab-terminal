"use client"

import { useEcosystem } from "@/hooks/use-ecosystem"
import { EcosystemOverview } from "../home/ecosystem-overview"
import { ProgramStatus } from "../home/program-status"
import { TopMarkets } from "../home/top-markets"
import { LiquidationWatch } from "../home/liquidation-watch"
import { NetworkBreakdown } from "../home/network-breakdown"
import { TerminalPanel } from "../terminal-panel"

/** Skeleton placeholder while ecosystem data loads */
function EcosystemSkeleton() {
  return (
    <TerminalPanel title="Ecosystem Overview">
      <div className="flex items-center justify-center py-4">
        <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
        <span className="ml-2 text-[10px] text-[var(--terminal-dim)]">SCANNING ECOSYSTEM...</span>
      </div>
    </TerminalPanel>
  )
}

export function HomeView() {
  const { data } = useEcosystem()

  return (
    <div className="flex flex-col gap-px">
      {/* Row 1: Ecosystem Overview — shows skeleton while loading */}
      {data ? <EcosystemOverview data={data} /> : <EcosystemSkeleton />}

      {/* Row 2: Program Status + Top Markets — each has own loading state */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
        {data ? (
          <ProgramStatus programs={data.programSummaries} />
        ) : (
          <TerminalPanel title="Program Status">
            <div className="flex items-center justify-center py-4">
              <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
              <span className="ml-2 text-[10px] text-[var(--terminal-dim)]">LOADING...</span>
            </div>
          </TerminalPanel>
        )}
        <TopMarkets />
      </div>

      {/* Row 3: Liquidation Watchlist + Network Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
        <LiquidationWatch />
        {data ? (
          <NetworkBreakdown data={data} />
        ) : (
          <TerminalPanel title="Network Breakdown">
            <div className="flex items-center justify-center py-4">
              <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
              <span className="ml-2 text-[10px] text-[var(--terminal-dim)]">LOADING...</span>
            </div>
          </TerminalPanel>
        )}
      </div>
    </div>
  )
}
