"use client"

import { useLiquidations, type LiquidationEntry } from "@/hooks/use-liquidations"
import { useNavigation } from "@/hooks/use-navigation"
import { TerminalPanel } from "../terminal-panel"
import { truncateAddress } from "../explorer-link"

function healthColor(health: number): string {
  if (health < 10) return "var(--terminal-red)"
  if (health < 20) return "var(--terminal-red)"
  if (health < 50) return "var(--terminal-amber)"
  return "var(--terminal-green)"
}

function formatCompact(n: number): string {
  if (n === 0) return "0"
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

function LiquidationRow({ entry, severity }: { entry: LiquidationEntry; severity: "critical" | "warning" }) {
  const { navigateToSlab } = useNavigation()
  const color = healthColor(entry.health)
  const isCritical = severity === "critical"

  return (
    <tr
      className={`border-b border-dotted border-[var(--terminal-border)] hover:bg-[var(--terminal-hover)] transition-colors cursor-pointer group ${
        isCritical ? "bg-[rgba(255,0,0,0.03)]" : ""
      }`}
      onClick={() => navigateToSlab(entry.slabAddress, entry.programLabel, entry.network, entry.program)}
    >
      <td className="py-1 pr-2">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${isCritical ? "animate-pulse" : ""}`}
          style={{ backgroundColor: color }}
        />
      </td>
      <td className="py-1 pr-2 text-[var(--terminal-cyan)] font-mono group-hover:text-[var(--terminal-green)] transition-colors">
        {truncateAddress(entry.accountId, 4)}
      </td>
      <td className="py-1 pr-2 text-[9px] text-[var(--terminal-dim)]">
        {entry.programLabel.slice(0, 8)}
      </td>
      <td className="py-1 pr-2">
        <span className={entry.side === "long" ? "text-[var(--terminal-green)]" : "text-[var(--terminal-red)]"}>
          {entry.side === "long" ? "L" : "S"}
        </span>
      </td>
      <td className="py-1 pr-2 text-right font-mono">
        {formatCompact(entry.size)}
      </td>
      <td className="py-1 pr-2 text-right font-mono" style={{ color }}>
        {entry.health.toFixed(0)}%
      </td>
      <td className="py-1 pr-2 text-right font-mono text-[var(--terminal-dim)]">
        ${entry.liquidationPrice.toFixed(2)}
      </td>
      <td className="py-1 text-right font-mono">
        <span style={{ color: entry.distancePercent < 5 ? "var(--terminal-red)" : "var(--terminal-amber)" }}>
          {entry.distancePercent.toFixed(1)}%
        </span>
      </td>
    </tr>
  )
}

export function LiquidationWatch() {
  const { data, isLoading } = useLiquidations()

  if (isLoading || !data) {
    return (
      <TerminalPanel title="Liquidation Watchlist">
        <div className="flex items-center justify-center py-6">
          <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
          <span className="ml-2 text-[10px] text-[var(--terminal-dim)]">SCANNING POSITIONS...</span>
        </div>
      </TerminalPanel>
    )
  }

  const hasCritical = data.critical.length > 0
  const hasWarning = data.warning.length > 0
  const hasEntries = hasCritical || hasWarning

  return (
    <TerminalPanel
      title={`Liquidation Watchlist (${data.summary.criticalCount} critical, ${data.summary.warningCount} warning)`}
    >
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-2 border-b border-[var(--terminal-border)] text-[10px]">
        <span className="text-[var(--terminal-dim)]">
          SCANNED: <span className="font-bold text-[var(--terminal-green)]">{data.summary.totalScanned}</span> accounts
        </span>
        <span className="text-[var(--terminal-dim)]">
          SLABS: <span className="font-bold text-[var(--terminal-green)]">{data.summary.slabsParsed}</span>/{data.summary.totalSlabs}
        </span>
        <span className="text-[var(--terminal-dim)]">
          SAFE: <span className="font-bold text-[var(--terminal-green)]">{data.summary.safeAccounts}</span>
        </span>
        {data.summary.mainnetAccounts > 0 && (
          <span className="text-[var(--terminal-amber)]">
            MAINNET: {data.summary.mainnetAccounts} accts ({data.summary.mainnetPrograms} programs)
          </span>
        )}
      </div>

      {!hasEntries ? (
        <div className="flex flex-col items-center justify-center py-6 gap-1">
          <span className="text-[var(--terminal-green)] text-xs">ALL CLEAR</span>
          <span className="text-[10px] text-[var(--terminal-dim)]">
            No positions at liquidation risk across {data.summary.slabsParsed} slabs
          </span>
        </div>
      ) : (
        <div className="max-h-[300px] overflow-y-auto mt-1">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[var(--terminal-dim)] text-left uppercase">
                <th className="pb-1 pr-2 w-4"></th>
                <th className="pb-1 pr-2">ACCOUNT</th>
                <th className="pb-1 pr-2">PROGRAM</th>
                <th className="pb-1 pr-2">SIDE</th>
                <th className="pb-1 pr-2 text-right">SIZE</th>
                <th className="pb-1 pr-2 text-right">HEALTH</th>
                <th className="pb-1 pr-2 text-right">LIQ.PRICE</th>
                <th className="pb-1 text-right">DIST</th>
              </tr>
            </thead>
            <tbody>
              {data.critical.map((entry, i) => (
                <LiquidationRow key={`c-${i}`} entry={entry} severity="critical" />
              ))}
              {hasCritical && hasWarning && (
                <tr>
                  <td colSpan={8} className="py-1">
                    <div className="border-t border-dashed border-[var(--terminal-amber)] flex items-center gap-2">
                      <span className="text-[9px] text-[var(--terminal-amber)] py-0.5">WARNING ZONE</span>
                      <span className="flex-1 border-t border-dashed border-[var(--terminal-border)]" />
                    </div>
                  </td>
                </tr>
              )}
              {data.warning.map((entry, i) => (
                <LiquidationRow key={`w-${i}`} entry={entry} severity="warning" />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 text-[9px] text-[var(--terminal-dim)]">
        Click any row to drill into slab detail • Refreshes every 15s
      </div>
    </TerminalPanel>
  )
}
