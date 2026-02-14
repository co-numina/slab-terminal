"use client"

import { TerminalPanel } from "../terminal-panel"
import type { EcosystemData } from "@/hooks/use-ecosystem"

function NetworkCard({
  network,
  stats,
  total,
}: {
  network: "devnet" | "mainnet"
  stats: { programs: number; slabs: number; accounts: number }
  total: { slabs: number; accounts: number }
}) {
  const isMainnet = network === "mainnet"
  const color = isMainnet ? "var(--terminal-green)" : "var(--terminal-amber)"
  const slabPercent = total.slabs > 0 ? ((stats.slabs / total.slabs) * 100).toFixed(0) : "0"
  const acctPercent = total.accounts > 0 ? ((stats.accounts / total.accounts) * 100).toFixed(0) : "0"

  return (
    <div className="flex-1 min-w-[140px] border border-[var(--terminal-border)]">
      {/* Network header */}
      <div
        className="flex items-center gap-1.5 px-2 py-1 border-b border-[var(--terminal-border)]"
        style={{ borderLeft: `2px solid ${color}` }}
      >
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${stats.programs > 0 ? "animate-pulse-live" : ""}`}
          style={{ backgroundColor: stats.programs > 0 ? color : "var(--terminal-dim)" }}
        />
        <span className="text-[10px] font-bold uppercase" style={{ color }}>
          {network}
        </span>
        {isMainnet && stats.programs > 0 && (
          <span className="text-[7px] text-[var(--terminal-amber)]" title="Real value at risk">
            {"\u26A0"} REAL
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="px-2 py-1.5 flex flex-col gap-1">
        <div className="flex items-baseline justify-between text-[9px]">
          <span className="text-[var(--terminal-dim)]">PROGRAMS</span>
          <span className="font-bold font-mono" style={{ color }}>{stats.programs}</span>
        </div>

        <div className="flex flex-col gap-px">
          <div className="flex items-baseline justify-between text-[9px]">
            <span className="text-[var(--terminal-dim)]">SLABS</span>
            <span className="font-mono">
              <span className="font-bold" style={{ color }}>{stats.slabs}</span>
              <span className="text-[var(--terminal-dim)] text-[8px] ml-0.5">({slabPercent}%)</span>
            </span>
          </div>
          <div className="w-full h-0.5 bg-[var(--terminal-bg)] border border-[var(--terminal-border)]">
            <div className="h-full" style={{ width: `${Math.min(100, parseFloat(slabPercent))}%`, backgroundColor: color }} />
          </div>
        </div>

        <div className="flex flex-col gap-px">
          <div className="flex items-baseline justify-between text-[9px]">
            <span className="text-[var(--terminal-dim)]">ACCOUNTS</span>
            <span className="font-mono">
              <span className="font-bold" style={{ color }}>{stats.accounts.toLocaleString()}</span>
              <span className="text-[var(--terminal-dim)] text-[8px] ml-0.5">({acctPercent}%)</span>
            </span>
          </div>
          <div className="w-full h-0.5 bg-[var(--terminal-bg)] border border-[var(--terminal-border)]">
            <div className="h-full" style={{ width: `${Math.min(100, parseFloat(acctPercent))}%`, backgroundColor: color }} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function NetworkBreakdown({ data }: { data: EcosystemData }) {
  const total = {
    slabs: data.slabs.total,
    accounts: data.accounts.total,
  }

  return (
    <TerminalPanel title="Network Breakdown">
      <div className="flex flex-col sm:flex-row gap-1.5">
        <NetworkCard
          network="devnet"
          stats={data.networks.devnet}
          total={total}
        />
        <NetworkCard
          network="mainnet"
          stats={data.networks.mainnet}
          total={total}
        />
      </div>
    </TerminalPanel>
  )
}
