"use client"

import { useActivity, type ActivityEvent } from "@/hooks/use-market-data"
import { TerminalPanel } from "./terminal-panel"

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
      <span className="text-[10px] text-[var(--terminal-green)]">
        {event.details}
      </span>
    </div>
  )
}

export function ActivityFeed() {
  const { data } = useActivity()
  const events = data?.events ?? []

  return (
    <TerminalPanel title="Activity Log" className="h-full">
      <div className="feed-fade-mask flex max-h-[280px] flex-col overflow-y-auto">
        {events.map((e, i) => (
          <EventRow key={`${e.timestamp}-${i}`} event={e} />
        ))}
        {events.length === 0 && (
          <div className="flex items-center justify-center py-4">
            <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
            <span className="ml-2 text-[10px] text-[var(--terminal-dim)]">AWAITING EVENTS...</span>
          </div>
        )}
      </div>
    </TerminalPanel>
  )
}
