"use client"

import { useState } from "react"
import { useLPs, type LP } from "@/hooks/use-market-data"
import { TerminalPanel } from "./terminal-panel"
import { ExplorerLink } from "./explorer-link"

function isActiveLp(lp: LP): boolean {
  return (
    lp.inventory !== 0 ||
    lp.lastExecPrice > 0 ||
    lp.collateral > 0.5
  )
}

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
  const liquidityNotional = lp.liquidityNotional ?? lp.collateral * (lp.lastOraclePrice ?? 148.55)

  const displayLabel = lp.label || `LP ${lp.index}`

  return (
    <div className="border border-[var(--terminal-border)]">
      <div
        className="flex items-center justify-between border-b border-[var(--terminal-border)] bg-[var(--terminal-bg)] px-2 py-1"
        style={{ borderLeft: `2px solid ${accentColor}` }}
      >
        <span className="text-xs font-bold" style={{ color: accentColor }}>
          {displayLabel}
        </span>
        {lp.pdaPubkey && (
          <ExplorerLink type="address" address={lp.pdaPubkey} />
        )}
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

function InactiveLPRow({ lp }: { lp: LP }) {
  const isPassive = lp.type === "passive"
  const accentColor = isPassive ? "var(--terminal-green)" : "var(--terminal-cyan)"

  return (
    <div className="flex items-center justify-between py-0.5 px-1 text-[10px] opacity-60 hover:opacity-100 transition-opacity">
      <div className="flex items-center gap-2">
        <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
        <span className="text-[var(--terminal-dim)]">LP {lp.index}</span>
        <span className="text-[9px] uppercase" style={{ color: accentColor }}>
          {isPassive ? "PASSIVE" : "vAMM"}
        </span>
        <span className="text-[9px] text-[var(--terminal-dim)]">{lp.slabLabel}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[var(--terminal-dim)]">{lp.collateral.toFixed(2)} SOL</span>
        {lp.pdaPubkey && (
          <ExplorerLink type="address" address={lp.pdaPubkey} />
        )}
      </div>
    </div>
  )
}

export function LPPerformance() {
  const { data } = useLPs()
  const lps = data?.lps ?? []
  const [showInactive, setShowInactive] = useState(false)

  const activeLps = lps.filter(isActiveLp)
  const inactiveLps = lps.filter((lp) => !isActiveLp(lp))

  return (
    <TerminalPanel title={`LP Performance [${activeLps.length} ACTIVE / ${lps.length} TOTAL]`} className="h-full">
      <div className="max-h-[700px] overflow-y-auto flex flex-col gap-2">
        {/* Active LP cards */}
        {activeLps.map((lp) => (
          <LPCard key={lp.label || `${lp.slabLabel}-${lp.index}`} lp={lp} />
        ))}

        {activeLps.length === 0 && lps.length > 0 && (
          <div className="flex items-center justify-center py-2">
            <span className="text-[10px] text-[var(--terminal-dim)]">NO ACTIVE LPs</span>
          </div>
        )}

        {/* Inactive LPs collapsible section */}
        {inactiveLps.length > 0 && (
          <div className="border-t border-[var(--terminal-border)] pt-1">
            <button
              onClick={() => setShowInactive(!showInactive)}
              className="flex w-full items-center gap-2 py-1 text-[10px] text-[var(--terminal-dim)] hover:text-[var(--terminal-amber)] transition-colors select-none"
            >
              <span className="text-[var(--terminal-amber)]">{showInactive ? "\u25bc" : "\u25b6"}</span>
              <span className="uppercase tracking-wider">
                INACTIVE LPs ({inactiveLps.length})
              </span>
              <span className="flex-1 border-t border-dashed border-[var(--terminal-border)]" />
              <span className="text-[9px]">
                {showInactive ? "COLLAPSE" : "EXPAND"}
              </span>
            </button>
            {showInactive && (
              <div className="flex flex-col mt-1">
                {inactiveLps.map((lp) => (
                  <InactiveLPRow key={lp.label || `${lp.slabLabel}-${lp.index}`} lp={lp} />
                ))}
              </div>
            )}
          </div>
        )}

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
