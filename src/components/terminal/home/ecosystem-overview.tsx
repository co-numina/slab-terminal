"use client"

import { TerminalPanel } from "../terminal-panel"
import type { EcosystemData } from "@/hooks/use-ecosystem"

function StatCard({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 border border-[var(--terminal-border)] px-3 py-2 min-w-[120px]">
      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--terminal-dim)]">
        {label}
      </span>
      <div className="flex flex-col gap-0.5 text-[10px]">{children}</div>
    </div>
  )
}

function healthColor(status: string): string {
  switch (status) {
    case "active": return "var(--terminal-green)"
    case "stale": return "var(--terminal-amber)"
    case "idle": return "var(--terminal-dim)"
    case "dead": return "var(--terminal-red)"
    default: return "var(--terminal-dim)"
  }
}

export function EcosystemOverview({ data }: { data: EcosystemData }) {
  const { programs, slabs, accounts, positions, networks } = data

  return (
    <TerminalPanel title="Ecosystem Overview">
      <div className="flex flex-wrap gap-2">
        {/* Programs */}
        <StatCard label="Programs">
          <span className="text-lg font-bold text-[var(--terminal-green)]">{programs.total}</span>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {programs.active > 0 && (
              <span style={{ color: healthColor("active") }}>{programs.active} active</span>
            )}
            {programs.stale > 0 && (
              <span style={{ color: healthColor("stale") }}>{programs.stale} stale</span>
            )}
            {programs.idle > 0 && (
              <span style={{ color: healthColor("idle") }}>{programs.idle} idle</span>
            )}
            {programs.dead > 0 && (
              <span style={{ color: healthColor("dead") }}>{programs.dead} dead</span>
            )}
          </div>
        </StatCard>

        {/* Markets */}
        <StatCard label="Markets">
          <span className="text-lg font-bold text-[var(--terminal-green)]">~{slabs.withAccounts}</span>
          <span className="text-[var(--terminal-dim)]">
            across {slabs.total} slabs
          </span>
        </StatCard>

        {/* Active Positions */}
        <StatCard label="Active Positions">
          {positions.activeLongs + positions.activeShorts > 0 ? (
            <>
              <span className="text-lg font-bold text-[var(--terminal-green)]">
                {positions.activeLongs + positions.activeShorts}
              </span>
              <div className="flex gap-2">
                <span className="text-[var(--terminal-green)]">{positions.activeLongs}L</span>
                <span className="text-[var(--terminal-red)]">{positions.activeShorts}S</span>
                {positions.flat > 0 && (
                  <span className="text-[var(--terminal-dim)]">{positions.flat} flat</span>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="text-lg font-bold text-[var(--terminal-dim)]">0</span>
              <span className="text-[var(--terminal-dim)]">
                {accounts.total.toLocaleString()} total accounts
              </span>
            </>
          )}
        </StatCard>

        {/* TVL */}
        <StatCard label="TVL">
          {Object.entries(data.tvl).length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {Object.entries(data.tvl).map(([key, val]) => {
                const [symbol] = key.split("_")
                return (
                  <div key={key} className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-[var(--terminal-green)]">
                      {val.amount >= 1_000_000
                        ? `${(val.amount / 1_000_000).toFixed(1)}M`
                        : val.amount >= 1_000
                          ? `${(val.amount / 1_000).toFixed(1)}K`
                          : val.amount.toFixed(1)}
                    </span>
                    <span className="text-[var(--terminal-cyan)]">{symbol}</span>
                    <span className="text-[var(--terminal-dim)]">({val.network})</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <span className="text-[var(--terminal-dim)]">scanning...</span>
          )}
        </StatCard>

        {/* Mainnet */}
        <StatCard label="Mainnet">
          {networks.mainnet.programs > 0 ? (
            <>
              <span className="text-lg font-bold text-[var(--terminal-green)]">
                {networks.mainnet.programs}
              </span>
              <span className="text-[var(--terminal-dim)]">
                {networks.mainnet.slabs} slabs
              </span>
              <span className="text-[var(--terminal-dim)]">
                {networks.mainnet.accounts} accounts
              </span>
            </>
          ) : (
            <span className="text-[var(--terminal-dim)]">none detected</span>
          )}
        </StatCard>

        {/* Last Scan */}
        <StatCard label="Last Scan">
          <span className="text-sm font-bold text-[var(--terminal-green)]">
            {data.scanDurationMs}ms
          </span>
          <span className="text-[9px] text-[var(--terminal-dim)]">
            {new Date(data.lastScan).toLocaleTimeString()}
          </span>
        </StatCard>
      </div>
    </TerminalPanel>
  )
}
