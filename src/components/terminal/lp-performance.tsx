"use client"

import { useLPs, type LP } from "@/hooks/use-market-data"
import { TerminalPanel } from "./terminal-panel"

function UtilizationBar({ percent }: { percent: number }) {
  const totalBars = 30
  const filledBars = Math.round((percent / 100) * totalBars)
  const filled = "\u2588".repeat(filledBars)
  const empty = "\u2591".repeat(totalBars - filledBars)

  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-xs leading-none">
        <span className="text-[var(--terminal-green)]">{filled}</span>
        <span className="text-[var(--terminal-dim)]">{empty}</span>
      </span>
      <span className="shrink-0 text-xs text-[var(--terminal-dim)]">
        {percent.toFixed(1)}%
      </span>
    </div>
  )
}

function LPCard({ lp }: { lp: LP }) {
  const inventoryColor =
    lp.inventory >= 0 ? "var(--terminal-green)" : "var(--terminal-red)"
  const isPassive = lp.type === "passive"
  const accentColor = isPassive ? "var(--terminal-green)" : "var(--terminal-cyan)"
  const typeLabel = isPassive ? "PASSIVE" : "vAMM"
  const liquidityNotional = lp.liquidityNotional ?? lp.collateral * (lp.lastOraclePrice ?? 148.55)

  return (
    <div className="border border-[var(--terminal-border)]">
      <div
        className="flex items-center border-b border-[var(--terminal-border)] bg-[var(--terminal-bg)] px-2 py-1"
        style={{ borderLeft: `2px solid ${accentColor}` }}
      >
        <span className="text-xs font-bold" style={{ color: accentColor }}>
          LP {lp.index} {"\u2014"} {typeLabel}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        <div className="flex justify-between">
          <span className="text-[10px] uppercase text-[var(--terminal-dim)]">SPREAD</span>
          <span className="text-xs text-[var(--terminal-green)]">{lp.spreadBps} bps</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] uppercase text-[var(--terminal-dim)]">COLLATERAL</span>
          <span className="text-xs text-[var(--terminal-green)]">{lp.collateral.toFixed(1)} SOL</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] uppercase text-[var(--terminal-dim)]">LIQUIDITY DEPTH</span>
          <span className="text-xs text-[var(--terminal-cyan)]">${liquidityNotional.toFixed(0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] uppercase text-[var(--terminal-dim)]">INVENTORY</span>
          <span className="text-xs" style={{ color: inventoryColor }}>
            {lp.inventory >= 0 ? "+" : ""}{lp.inventory.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] uppercase text-[var(--terminal-dim)]">LAST EXEC</span>
          <span className="text-xs text-[var(--terminal-green)]">{lp.lastExecPrice.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] uppercase text-[var(--terminal-dim)]">FEE</span>
          <span className="text-xs text-[var(--terminal-green)]">{lp.tradingFeeBps} bps</span>
        </div>
        <div className="mt-1 border-t border-[var(--terminal-border)] pt-1">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase text-[var(--terminal-dim)]">UTIL</span>
            <UtilizationBar percent={lp.utilization} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function LPPerformance() {
  const { data } = useLPs()
  const lps = data?.lps ?? []

  return (
    <TerminalPanel title="LP Performance" className="h-full">
      <div className="flex flex-col gap-2">
        {lps.map((lp) => (
          <LPCard key={lp.index} lp={lp} />
        ))}
        {lps.length === 0 && (
          <div className="flex items-center justify-center py-4">
            <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
            <span className="ml-2 text-[10px] text-[var(--terminal-dim)]">LOADING LP DATA...</span>
          </div>
        )}
      </div>
    </TerminalPanel>
  )
}
