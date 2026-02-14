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

const HEALTH_BAR_CHARS = 40

function WorstHealthBar({ health }: { health: number }) {
  const fillChars = Math.max(0, Math.min(HEALTH_BAR_CHARS, Math.round((health / 100) * HEALTH_BAR_CHARS)))
  const emptyChars = HEALTH_BAR_CHARS - fillChars
  const color = healthColor(health)

  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold text-[var(--terminal-cyan)] tracking-wider uppercase w-24 shrink-0">
        WORST HEALTH
      </span>
      <span className="font-mono text-[11px] leading-none whitespace-nowrap">
        <span style={{ color }}>{"\u2588".repeat(fillChars)}</span>
        <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(emptyChars)}</span>
      </span>
      <span className="text-[10px] font-bold font-mono" style={{ color }}>
        {health.toFixed(0)}%
      </span>
    </div>
  )
}

const ENTRY_BAR_CHARS = 16

function CriticalRow({ entry }: { entry: LiquidationEntry }) {
  const { navigateToSlab } = useNavigation()
  const color = healthColor(entry.health)
  const fillChars = Math.max(0, Math.min(ENTRY_BAR_CHARS, Math.round((entry.health / 100) * ENTRY_BAR_CHARS)))
  const emptyChars = ENTRY_BAR_CHARS - fillChars

  return (
    <div
      className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-[var(--terminal-hover)] transition-colors px-1"
      onClick={() => navigateToSlab(entry.slabAddress, entry.programLabel, entry.network, entry.program)}
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
      <span className="font-mono text-[9px] leading-none whitespace-nowrap">
        <span style={{ color }}>{"\u2588".repeat(fillChars)}</span>
        <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(emptyChars)}</span>
        <span className="ml-1" style={{ color }}>{entry.health.toFixed(0)}%</span>
      </span>
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

  // Compute worst health across all entries (100% if all clear)
  let worstHealth = 100
  for (const e of [...data.critical, ...data.warning]) {
    if (e.health < worstHealth) worstHealth = e.health
  }

  // Compact "all clear" state
  if (!hasEntries) {
    return (
      <TerminalPanel title="Risk Monitor">
        <div className="flex flex-col gap-2">
          {/* Status line */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-[var(--terminal-cyan)] tracking-wider uppercase">
              LIQUIDATIONS
            </span>
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--terminal-green)] animate-pulse-live" />
            <span className="text-[10px] text-[var(--terminal-green)] font-bold">ALL CLEAR</span>
          </div>
          <div className="text-[9px] text-[var(--terminal-dim)]">
            Scanned {data.summary.totalScanned} accounts across {data.summary.slabsParsed} slabs {"\u00B7"} 0 critical {"\u00B7"} 0 warning
          </div>

          {/* Worst health bar */}
          <WorstHealthBar health={100} />

          {/* Mainnet warning */}
          {hasMainnet && (
            <div className="text-[8px] text-[var(--terminal-amber)]">
              {"\u26A0"} MAINNET {"\u00B7"} {data.summary.mainnetAccounts} accounts monitored {"\u00B7"} $PERC at stake
              <br />
              Admin burned {"\u2014"} no emergency intervention possible
            </div>
          )}
        </div>
      </TerminalPanel>
    )
  }

  // Expanded state: show critical positions
  const topEntries = [...data.critical, ...data.warning].slice(0, 4)

  return (
    <TerminalPanel title={`Risk Monitor (${data.summary.criticalCount}C/${data.summary.warningCount}W)`}>
      <div className="flex flex-col gap-2">
        {/* Status line */}
        <div className="flex items-center gap-3 text-[9px]">
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

        {/* Worst health bar */}
        <WorstHealthBar health={worstHealth} />

        {/* Critical entries */}
        <div className="flex flex-col border-t border-[var(--terminal-border)] pt-1">
          {topEntries.map((entry, i) => (
            <CriticalRow key={`${entry.slabAddress}-${entry.accountIndex}-${i}`} entry={entry} />
          ))}
          {data.critical.length + data.warning.length > 4 && (
            <div className="text-[8px] text-[var(--terminal-dim)] mt-1 px-1">
              +{data.critical.length + data.warning.length - 4} more positions at risk
            </div>
          )}
        </div>
      </div>
    </TerminalPanel>
  )
}
