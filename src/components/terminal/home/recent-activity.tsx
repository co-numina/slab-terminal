"use client"

import { useEffect, useRef, useState } from "react"
import { useRadarData, type RadarData, type ProgramRadar } from "@/hooks/use-radar-data"
import { TerminalPanel } from "../terminal-panel"

export interface ActivityEvent {
  type: "CRANK"
  program: string
  slabLabel: string
  slot: number
  timestamp: number
  network: "devnet" | "mainnet"
}

function programShort(label: string): string {
  const l = label.toLowerCase()
  if (l.includes("small")) return "launch-s"
  if (l.includes("medium")) return "launch-m"
  if (l.includes("large")) return "launch-l"
  if (l.includes("toly")) return "toly"
  if (l.includes("sov")) return "SOV"
  return label.slice(0, 8)
}

function formatTimeAgo(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

/**
 * Build initial activity events from program crank ages (before any diffs).
 * This gives the feed content on first load.
 */
function buildInitialEvents(programs: ProgramRadar[]): ActivityEvent[] {
  const events: ActivityEvent[] = []
  const now = Date.now()

  for (const program of programs) {
    for (const slab of program.slabs) {
      if (slab.lastCrankSlot <= 0) continue
      // Estimate timestamp from relative slot differences
      const programAge = program.lastCrankSlot > 0
        ? (program.lastCrankSlot - slab.lastCrankSlot) * 400
        : 0

      events.push({
        type: "CRANK",
        program: program.label,
        slabLabel: slab.label || `slab-${slab.pubkey.slice(0, 4)}`,
        slot: slab.lastCrankSlot,
        timestamp: now - Math.max(0, programAge),
        network: program.network,
      })
    }
  }

  events.sort((a, b) => b.slot - a.slot)
  return events.slice(0, 20)
}

export function RecentActivity() {
  const { data: radarData } = useRadarData()

  const prevRadarRef = useRef<RadarData | null>(null)
  const [activityLog, setActivityLog] = useState<ActivityEvent[]>([])
  const [initialized, setInitialized] = useState(false)
  const [, setTick] = useState(0)

  // Re-render every 10s to update "Xs ago" timestamps
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10000)
    return () => clearInterval(interval)
  }, [])

  // Build initial events on first radar load
  useEffect(() => {
    if (!radarData || initialized) return

    const initial = buildInitialEvents(radarData.programs)
    setActivityLog(initial)
    prevRadarRef.current = radarData
    setInitialized(true)
  }, [radarData, initialized])

  // Diff radar data on subsequent refreshes
  useEffect(() => {
    if (!radarData || !prevRadarRef.current || !initialized) return
    if (radarData === prevRadarRef.current) return

    const prev = prevRadarRef.current
    const newEvents: ActivityEvent[] = []
    const now = Date.now()

    for (const program of radarData.programs) {
      const prevProgram = prev.programs.find(p => p.id === program.id)
      if (!prevProgram) continue

      for (const slab of program.slabs) {
        const prevSlab = prevProgram.slabs.find(s => s.pubkey === slab.pubkey)
        if (!prevSlab) continue

        if (slab.lastCrankSlot !== prevSlab.lastCrankSlot && slab.lastCrankSlot > 0) {
          newEvents.push({
            type: "CRANK",
            program: program.label,
            slabLabel: slab.label || `slab-${slab.pubkey.slice(0, 4)}`,
            slot: slab.lastCrankSlot,
            timestamp: now,
            network: program.network,
          })
        }
      }
    }

    if (newEvents.length > 0) {
      setActivityLog(prev => [...newEvents, ...prev].slice(0, 20))
    }

    prevRadarRef.current = radarData
  }, [radarData, initialized])

  const displayEvents = activityLog.slice(0, 5)
  const now = Date.now()

  return (
    <TerminalPanel title="Recent Activity">
      {displayEvents.length > 0 ? (
        <div className="flex flex-col gap-px">
          {displayEvents.map((event, i) => (
            <div key={`${event.slot}-${event.program}-${i}`} className="flex items-center gap-3 py-0.5 text-[10px] font-mono">
              <span className="text-[var(--terminal-dim)] w-16 shrink-0 text-right">
                {formatTimeAgo(now - event.timestamp)}
              </span>
              <span className="font-bold w-12 shrink-0 text-[var(--terminal-green)]">
                {event.type}
              </span>
              <span
                className="w-14 shrink-0"
                style={{
                  color: event.network === "mainnet"
                    ? "var(--terminal-amber)"
                    : "var(--terminal-cyan)",
                }}
              >
                {programShort(event.program)}
              </span>
              <span className="text-[var(--terminal-dim)] truncate">
                {event.slabLabel}
              </span>
              <span className="text-[var(--terminal-dim)] ml-auto shrink-0">
                slot {event.slot.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-2">
          <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
          <span className="ml-2 text-[9px] text-[var(--terminal-dim)]">WAITING FOR EVENTS...</span>
        </div>
      )}
      <div className="mt-1 text-[8px] text-[var(--terminal-dim)]">
        Showing last {displayEvents.length} events {"\u00B7"} Auto-refreshes every 30s
      </div>
    </TerminalPanel>
  )
}
