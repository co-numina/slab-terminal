"use client"

import { useState } from "react"
import { usePositions, type Position } from "@/hooks/use-market-data"
import { TerminalPanel } from "./terminal-panel"
import { ExplorerLink } from "./explorer-link"

function healthColor(health: number): string {
  if (health > 70) return "var(--terminal-green)"
  if (health > 40) return "var(--terminal-amber)"
  return "var(--terminal-red)"
}

function HealthIndicator({ health }: { health: number }) {
  const color = healthColor(health)
  const isCritical = health < 20
  const barWidth = Math.max(health, 5)

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative h-[3px] w-8 bg-[var(--terminal-border)]">
        <div
          className={`absolute inset-y-0 left-0 ${isCritical ? "animate-blink-critical" : ""}`}
          style={{ width: `${barWidth}%`, backgroundColor: color }}
        />
      </div>
      <span
        className={`text-xs font-bold ${isCritical ? "animate-blink-critical" : ""}`}
        style={{ color }}
      >
        {health}%
      </span>
    </div>
  )
}

const HEADERS = ["IDX", "SLAB", "SIDE", "SIZE", "ENTRY", "MARK", "PNL", "MARGIN", "HEALTH", ""] as const

function PositionRow({ position, isOdd, dimmed }: { position: Position; isOdd: boolean; dimmed?: boolean }) {
  const isLong = position.side === "long"
  const isFlat = position.side === "flat"
  const pnlPositive = position.unrealizedPnlPercent >= 0
  const rowBg = isOdd ? "bg-[var(--terminal-row-alt)]" : ""
  const opacity = dimmed ? "opacity-50" : ""

  const sideColor = isFlat
    ? "var(--terminal-dim)"
    : isLong
      ? "var(--terminal-green)"
      : "var(--terminal-red)"
  const sideLabel = isFlat ? "FLAT" : isLong ? "LONG" : "SHORT"

  // Link to owner if available, otherwise the slab
  const explorerAddress = position.owner || position.slabPubkey

  return (
    <tr className={`border-b border-[var(--terminal-border)] transition-colors hover:bg-[var(--terminal-hover)] ${rowBg} ${opacity}`}>
      <td className="px-2 py-1 text-left text-xs text-[var(--terminal-green)]">
        {String(position.accountIndex).padStart(3, "0")}
      </td>
      <td className="px-2 py-1 text-left text-[9px] text-[var(--terminal-dim)]">
        {position.slabLabel ?? ""}
      </td>
      <td className="px-2 py-1 text-left text-xs">
        <span className="font-bold" style={{ color: sideColor }}>
          {sideLabel}
        </span>
      </td>
      <td className="px-2 py-1 text-right text-xs">
        <span style={{ color: sideColor }}>
          {isFlat ? "\u2014" : `${position.size > 0 ? "+" : ""}${position.size.toLocaleString()}`}
        </span>
      </td>
      <td className="px-2 py-1 text-right text-xs text-[var(--terminal-green)]">
        {position.entryPrice > 0 ? position.entryPrice.toFixed(2) : "\u2014"}
      </td>
      <td className="px-2 py-1 text-right text-xs text-[var(--terminal-green)]">
        {position.markPrice.toFixed(2)}
      </td>
      <td className="px-2 py-1 text-right text-xs">
        <span style={{ color: isFlat ? "var(--terminal-dim)" : pnlPositive ? "var(--terminal-green)" : "var(--terminal-red)" }}>
          {isFlat ? "\u2014" : `${pnlPositive ? "+" : ""}${position.unrealizedPnlPercent.toFixed(2)}%`}
        </span>
      </td>
      <td className="px-2 py-1 text-right text-xs text-[var(--terminal-green)]">
        {position.collateral.toFixed(2)}
      </td>
      <td className="px-2 py-1 text-right">
        <HealthIndicator health={position.marginHealth} />
      </td>
      <td className="px-1 py-1 text-center">
        {explorerAddress && (
          <ExplorerLink type="address" address={explorerAddress} />
        )}
      </td>
    </tr>
  )
}

export function PositionsTable() {
  const { data } = usePositions()
  const positions = data?.positions ?? []
  const [showFlat, setShowFlat] = useState(false)

  const active = positions
    .filter((p) => p.side !== "flat")
    .sort((a, b) => a.marginHealth - b.marginHealth)
  const flat = positions.filter((p) => p.side === "flat")

  const totalLong = active.filter((p) => p.side === "long").reduce((s, p) => s + p.size, 0)
  const totalShort = active.filter((p) => p.side === "short").reduce((s, p) => s + p.size, 0)
  const net = totalLong + totalShort

  return (
    <TerminalPanel title={`Active Positions [${active.length}/${positions.length}]`}>
      {active.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-4 border-b border-[var(--terminal-border)] bg-[var(--terminal-bg)] px-2 py-1.5 text-[10px] -mx-3 -mt-2">
          <span className="text-[var(--terminal-dim)]">
            LONGS: <span className="font-bold text-[var(--terminal-green)]">+{totalLong.toLocaleString()}</span>
          </span>
          <span className="text-[var(--terminal-dim)]">
            SHORTS: <span className="font-bold text-[var(--terminal-red)]">{totalShort.toLocaleString()}</span>
          </span>
          <span className="text-[var(--terminal-dim)]">
            NET: <span className={`font-bold ${net >= 0 ? "text-[var(--terminal-green)]" : "text-[var(--terminal-red)]"}`}>
              {net >= 0 ? "+" : ""}{net.toLocaleString()}
            </span>
          </span>
          <span className="text-[var(--terminal-dim)]">
            SLABS: <span className="font-bold text-[var(--terminal-cyan)]">{new Set(active.map((p) => p.slabLabel)).size}</span>
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-[var(--terminal-border)]">
              {HEADERS.map((h) => (
                <th
                  key={h || "explorer"}
                  className={`px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--terminal-dim)] ${
                    h === "IDX" || h === "SIDE" || h === "SLAB" ? "text-left" : h === "" ? "w-6" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Active positions */}
            {active.map((p, i) => (
              <PositionRow
                key={`${p.slabLabel ?? ""}-${p.accountIndex}`}
                position={p}
                isOdd={i % 2 === 1}
              />
            ))}

            {/* Flat accounts collapsible section */}
            {flat.length > 0 && (
              <tr
                className="border-b border-[var(--terminal-border)] cursor-pointer hover:bg-[var(--terminal-hover)] select-none"
                onClick={() => setShowFlat(!showFlat)}
              >
                <td colSpan={HEADERS.length} className="px-2 py-1.5">
                  <div className="flex items-center gap-2 text-[10px] text-[var(--terminal-dim)]">
                    <span className="text-[var(--terminal-amber)]">{showFlat ? "\u25bc" : "\u25b6"}</span>
                    <span className="uppercase tracking-wider">
                      FLAT ACCOUNTS ({flat.length})
                    </span>
                    <span className="flex-1 border-t border-dashed border-[var(--terminal-border)]" />
                    <span className="text-[9px]">
                      {showFlat ? "COLLAPSE" : "EXPAND"}
                    </span>
                  </div>
                </td>
              </tr>
            )}
            {showFlat &&
              flat.map((p, i) => (
                <PositionRow
                  key={`${p.slabLabel ?? ""}-${p.accountIndex}`}
                  position={p}
                  isOdd={i % 2 === 1}
                  dimmed
                />
              ))}
          </tbody>
        </table>
        {positions.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
            <span className="ml-2 text-[10px] text-[var(--terminal-dim)]">NO ACTIVE POSITIONS</span>
          </div>
        )}
      </div>
    </TerminalPanel>
  )
}
