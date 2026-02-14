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

const BAR_CHARS = 20

function HealthBar({ health }: { health: number }) {
  const fillChars = Math.max(0, Math.min(BAR_CHARS, Math.round((health / 100) * BAR_CHARS)))
  const emptyChars = BAR_CHARS - fillChars
  const color = healthColor(health)

  return (
    <span className="font-mono text-[9px] leading-none whitespace-nowrap">
      <span style={{ color }}>{"\u2588".repeat(fillChars)}</span>
      <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(emptyChars)}</span>
      <span className="ml-1" style={{ color }}>{health.toFixed(0)}%</span>
    </span>
  )
}

function CriticalRow({ entry }: { entry: LiquidationEntry }) {
  const { navigateToSlab } = useNavigation()
  const color = healthColor(entry.health)

  return (
    <div
      className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-[var(--terminal-hover)] transition-colors px-1"
      onClick={() => navigateToSlab(entry.slabAddress, entry.programLabel, entry.network)}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
        style={{ backgroundColor: color }}
      />
      <span className="text-[9px] font-mono text-[var(--terminal-cyan)] w-16 truncate">
        {truncateAddress(entry.accountId, 4)}
      </span>
      <span className={`text-[9px] w-4 ${entry.side === "long" ? "text-[var(--terminal-green)]" : "text-[var(--terminal-red)]"}`}>
        {entry.side === "long" ? "L" : "S"}
      </span>
      <HealthBar health={entry.health} />
      <span className="text-[8px] text-[var(--terminal-dim)] ml-auto">
        {entry.distancePercent.toFixed(1)}% away
      </span>
    </div>
  )
}

export function RiskMonitor() {
  const { data, isLoading } = useLiquidations()

  if (isLoading || !data) {
    return (
      <TerminalPanel title="Risk Monitor">
        <div className="flex items-center justify-center py-3">
          <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
          <span className="ml-2 text-[9px] text-[var(--terminal-dim)]">SCANNING...</span>
        </div>
      </TerminalPanel>
    )
  }

  const hasCritical = data.critical.length > 0
  const hasWarning = data.warning.length > 0
  const hasEntries = hasCritical || hasWarning
  const hasMainnet = data.summary.mainnetAccounts > 0

  // Compact "all clear" state
  if (!hasEntries) {
    return (
      <TerminalPanel title="Risk Monitor">
        <div className="flex items-center gap-3 py-1">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--terminal-green)] animate-pulse-live" />
          <span className="text-[10px] text-[var(--terminal-green)] font-bold">ALL CLEAR</span>
          <span className="text-[9px] text-[var(--terminal-dim)]">
            {data.summary.totalScanned} accts across {data.summary.slabsParsed} slabs
          </span>
        </div>
        {hasMainnet && (
          <div className="text-[8px] text-[var(--terminal-amber)] mt-1">
            {"\u26A0"} {data.summary.mainnetAccounts} mainnet accounts monitored
          </div>
        )}
      </TerminalPanel>
    )
  }

  // Expanded state: show critical positions
  const topEntries = [...data.critical, ...data.warning].slice(0, 4)

  return (
    <TerminalPanel title={`Risk Monitor (${data.summary.criticalCount}C/${data.summary.warningCount}W)`}>
      {/* Status line */}
      <div className="flex items-center gap-3 pb-1 mb-1 border-b border-[var(--terminal-border)] text-[9px]">
        <span className="text-[var(--terminal-dim)]">
          SCANNED: <span className="text-[var(--terminal-green)]">{data.summary.totalScanned}</span>
        </span>
        <span className="text-[var(--terminal-dim)]">
          SAFE: <span className="text-[var(--terminal-green)]">{data.summary.safeAccounts}</span>
        </span>
        {hasMainnet && (
          <span className="text-[var(--terminal-amber)]">
            {"\u26A0"} {data.summary.mainnetAccounts} mainnet
          </span>
        )}
      </div>

      {/* Critical entries */}
      <div className="flex flex-col">
        {topEntries.map((entry, i) => (
          <CriticalRow key={`${entry.slabAddress}-${entry.accountIndex}-${i}`} entry={entry} />
        ))}
        {data.critical.length + data.warning.length > 4 && (
          <div className="text-[8px] text-[var(--terminal-dim)] mt-1 px-1">
            +{data.critical.length + data.warning.length - 4} more positions at risk
          </div>
        )}
      </div>
    </TerminalPanel>
  )
}
