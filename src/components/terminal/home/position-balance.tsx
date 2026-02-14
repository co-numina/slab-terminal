"use client"

import { TerminalPanel } from "../terminal-panel"
import type { EcosystemData } from "@/hooks/use-ecosystem"

const BAR_CHARS = 50 // total width (each side gets up to 25)

function formatSize(n: number): string {
  if (n === 0) return "0"
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  if (Math.abs(n) >= 1) return n.toFixed(2)
  return n.toFixed(4)
}

export function PositionBalance({ data }: { data: EcosystemData }) {
  const { positions } = data
  const longsCount = positions.activeLongs
  const shortsCount = positions.activeShorts
  const totalActive = longsCount + shortsCount

  // No active positions
  if (totalActive === 0) {
    const halfChars = Math.floor(BAR_CHARS / 2)
    return (
      <TerminalPanel title="Ecosystem Sentiment">
        <div className="flex flex-col items-center gap-1 py-2">
          <div className="flex items-center gap-0 text-[10px]">
            <span className="text-[var(--terminal-dim)] w-12 text-right mr-2">SHORT</span>
            <span className="font-mono text-[11px] leading-none">
              <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(halfChars)}</span>
              <span style={{ color: "var(--terminal-dim)" }}>{"\u2502"}</span>
              <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(halfChars)}</span>
            </span>
            <span className="text-[var(--terminal-dim)] w-12 ml-2">LONG</span>
          </div>
          <span className="text-[9px] text-[var(--terminal-dim)]">
            NO ACTIVE POSITIONS {"\u2014"} FLAT
          </span>
        </div>
      </TerminalPanel>
    )
  }

  // Calculate bar widths based on counts
  const halfBar = Math.floor(BAR_CHARS / 2)
  const maxSide = Math.max(longsCount, shortsCount, 1)
  const shortWidth = Math.max(1, Math.round((shortsCount / maxSide) * halfBar))
  const longWidth = Math.max(1, Math.round((longsCount / maxSide) * halfBar))

  const shortEmpty = halfBar - shortWidth
  const longEmpty = halfBar - longWidth

  // Net position
  const net = longsCount - shortsCount
  const netLabel = net > 0
    ? `NET: LONG +${net}`
    : net < 0
      ? `NET: SHORT ${net}`
      : "NET: BALANCED"
  const netColor = net > 0 ? "var(--terminal-green)" : net < 0 ? "var(--terminal-red)" : "var(--terminal-dim)"

  return (
    <TerminalPanel title="Ecosystem Sentiment">
      <div className="flex flex-col items-center gap-1.5 py-1">
        {/* Labels */}
        <div className="flex items-center w-full px-1">
          <span className="text-[9px] text-[var(--terminal-red)] w-[80px] text-right font-bold">SHORT</span>
          <span className="flex-1" />
          <span className="text-[9px] text-[var(--terminal-green)] w-[80px] font-bold">LONG</span>
        </div>

        {/* Bar */}
        <div className="flex items-center gap-0">
          <span className="font-mono text-[11px] leading-none whitespace-nowrap">
            {/* Short side (right-aligned, grows from center leftward) */}
            <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(shortEmpty)}</span>
            <span style={{ color: "var(--terminal-red)" }}>{"\u2588".repeat(shortWidth)}</span>
            {/* Center marker */}
            <span style={{ color: "var(--terminal-dim)" }}>{"\u2502"}</span>
            {/* Long side (left-aligned, grows from center rightward) */}
            <span style={{ color: "var(--terminal-green)" }}>{"\u2588".repeat(longWidth)}</span>
            <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(longEmpty)}</span>
          </span>
        </div>

        {/* Counts */}
        <div className="flex items-center w-full px-1">
          <span className="text-[9px] text-[var(--terminal-dim)] w-[80px] text-right">
            {shortsCount} position{shortsCount !== 1 ? "s" : ""}
          </span>
          <span className="flex-1 text-center">
            <span className="text-[9px] font-bold" style={{ color: netColor }}>{netLabel}</span>
          </span>
          <span className="text-[9px] text-[var(--terminal-dim)] w-[80px]">
            {longsCount} position{longsCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </TerminalPanel>
  )
}
