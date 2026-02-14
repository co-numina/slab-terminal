"use client"

import { usePositions, type Position } from "@/hooks/use-market-data"
import { TerminalPanel } from "./terminal-panel"

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

function PositionRow({ position, isOdd }: { position: Position; isOdd: boolean }) {
  const isLong = position.side === "long"
  const pnlPositive = position.unrealizedPnlPercent >= 0
  const rowBg = isOdd ? "bg-[var(--terminal-row-alt)]" : ""

  return (
    <tr className={`border-b border-[var(--terminal-border)] transition-colors hover:bg-[var(--terminal-hover)] ${rowBg}`}>
      <td className="px-2 py-1 text-left text-xs text-[var(--terminal-green)]">
        {String(position.accountIndex).padStart(3, "0")}
      </td>
      <td className="px-2 py-1 text-left text-xs">
        <span
          className="font-bold"
          style={{ color: isLong ? "var(--terminal-green)" : "var(--terminal-red)" }}
        >
          {isLong ? "LONG" : "SHORT"}
        </span>
      </td>
      <td className="px-2 py-1 text-right text-xs">
        <span style={{ color: isLong ? "var(--terminal-green)" : "var(--terminal-red)" }}>
          {position.size > 0 ? "+" : ""}{position.size.toLocaleString()}
        </span>
      </td>
      <td className="px-2 py-1 text-right text-xs text-[var(--terminal-green)]">
        {position.entryPrice.toFixed(2)}
      </td>
      <td className="px-2 py-1 text-right text-xs text-[var(--terminal-green)]">
        {position.markPrice.toFixed(2)}
      </td>
      <td className="px-2 py-1 text-right text-xs">
        <span style={{ color: pnlPositive ? "var(--terminal-green)" : "var(--terminal-red)" }}>
          {pnlPositive ? "+" : ""}{position.unrealizedPnlPercent.toFixed(2)}%
        </span>
      </td>
      <td className="px-2 py-1 text-right text-xs text-[var(--terminal-green)]">
        {position.collateral.toFixed(2)}
      </td>
      <td className="px-2 py-1 text-right">
        <HealthIndicator health={position.marginHealth} />
      </td>
    </tr>
  )
}

export function PositionsTable() {
  const { data } = usePositions()
  const positions = data?.positions ?? []
  const sorted = [...positions].sort((a, b) => a.marginHealth - b.marginHealth)

  const totalLong = sorted.filter((p) => p.side === "long").reduce((s, p) => s + p.size, 0)
  const totalShort = sorted.filter((p) => p.side === "short").reduce((s, p) => s + p.size, 0)
  const net = totalLong + totalShort

  return (
    <TerminalPanel title={`Active Positions [${positions.length}]`}>
      {positions.length > 0 && (
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
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-[var(--terminal-border)]">
              {["IDX", "SIDE", "SIZE", "ENTRY", "MARK", "PNL", "MARGIN", "HEALTH"].map((h) => (
                <th
                  key={h}
                  className={`px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--terminal-dim)] ${
                    h === "IDX" || h === "SIDE" ? "text-left" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <PositionRow key={p.accountIndex} position={p} isOdd={i % 2 === 1} />
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
