"use client"

import { useActivity, useMarketData, type ActivityEvent } from "@/hooks/use-market-data"
import { TerminalPanel } from "./terminal-panel"
import { ExplorerLink } from "./explorer-link"

function eventColor(type: ActivityEvent["type"]): string {
  switch (type) {
    case "trade":
      return "var(--terminal-cyan)"
    case "crank":
      return "var(--terminal-dim)"
    case "funding":
      return "var(--terminal-amber)"
    case "deposit":
      return "var(--terminal-green)"
    case "withdraw":
      return "var(--terminal-amber)"
    case "liquidation":
      return "var(--terminal-red)"
    default:
      return "var(--terminal-dim)"
  }
}

function formatCrankAge(slotDiff: number): string {
  const seconds = Math.round(slotDiff * 0.4)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

function EventRow({ event }: { event: ActivityEvent }) {
  const time = new Date(event.timestamp)
  const timeStr = time.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const color = eventColor(event.type)
  const typeLabel = event.type.toUpperCase().padEnd(11)
  const isLiquidation = event.type === "liquidation"

  return (
    <div
      className="flex items-start gap-2 py-0.5 animate-slide-in"
      style={{
        borderLeft: `2px solid ${color}`,
        paddingLeft: "6px",
        backgroundColor: isLiquidation ? "rgba(255, 0, 64, 0.06)" : undefined,
      }}
    >
      <span className="shrink-0 text-[10px]" style={{ color: "#3a4450" }}>
        {timeStr}
      </span>
      <span
        className="shrink-0 text-[10px] font-bold uppercase"
        style={{ color }}
      >
        {typeLabel}
      </span>
      <span className="flex-1 text-[10px] text-[var(--terminal-green)]">
        {event.details}
      </span>
      {event.signature && (
        <ExplorerLink type="tx" address={event.signature} className="shrink-0" />
      )}
    </div>
  )
}

export function ActivityFeed() {
  const { data } = useActivity()
  const { data: marketData } = useMarketData()
  const events = data?.events ?? []

  const slot = marketData?.slot ?? 0
  const lastCrankSlot = marketData?.lastCrankSlot ?? 0
  const crankAgo = slot - lastCrankSlot

  return (
    <TerminalPanel title="Activity Log" className="h-full">
      <div className="feed-fade-mask flex max-h-[280px] flex-col overflow-y-auto">
        {events.map((e, i) => (
          <EventRow key={`${e.timestamp}-${i}`} event={e} />
        ))}
        {events.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="text-[10px] font-bold text-[var(--terminal-amber)]">
              MARKET IDLE {"\u2014"} NO RECENT ACTIVITY
            </span>
            <div className="flex flex-col gap-1 text-[10px]">
              {crankAgo > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[var(--terminal-dim)]">Last crank:</span>
                  <span className="text-[var(--terminal-green)]">{formatCrankAge(crankAgo)} ago</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[var(--terminal-dim)]">Status:</span>
                <span className="text-[var(--terminal-amber)]">Waiting for trades...</span>
              </div>
            </div>
            <span className="text-[9px] text-[var(--terminal-dim)] mt-1">
              Devnet market activates when the random-traders bot is running.
            </span>
          </div>
        )}
      </div>
    </TerminalPanel>
  )
}
