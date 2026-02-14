"use client"

import { TerminalPanel } from "../terminal-panel"
import type { ProgramSummary } from "@/hooks/use-ecosystem"

const CHARS = 60 // total width of heartbeat line

function healthColor(health: string): string {
  switch (health) {
    case "active": return "var(--terminal-green)"
    case "stale": return "var(--terminal-amber)"
    case "idle": return "var(--terminal-dim)"
    case "dead": return "var(--terminal-red)"
    default: return "var(--terminal-dim)"
  }
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h ago`
}

function programShort(label: string): string {
  const l = label.toLowerCase()
  if (l.includes("small")) return "LAUNCH SMALL"
  if (l.includes("medium")) return "LAUNCH MEDIUM"
  if (l.includes("large")) return "LAUNCH LARGE"
  if (l.includes("toly")) return "TOLY ORIGINAL"
  if (l.includes("sov")) return "SOV MAINNET"
  return label.toUpperCase().slice(0, 14)
}

/**
 * Build a heartbeat line for a program.
 *
 * For active programs with frequent cranks, the rightmost chars are filled with spikes.
 * For stale/idle, a single spike appears at the position matching lastCrankAge.
 * For dead programs, no spikes.
 */
function buildHeartbeatLine(program: ProgramSummary): { chars: string[]; colors: string[] } {
  const chars: string[] = new Array(CHARS).fill("\u2500") // ─ baseline
  const baseColor = "var(--terminal-border)"
  const colors: string[] = new Array(CHARS).fill(baseColor)
  const spikeColor = healthColor(program.health)

  if (program.health === "dead") {
    // No spikes, just flat line in dim red
    for (let i = 0; i < CHARS; i++) colors[i] = "var(--terminal-red)"
    return { chars, colors }
  }

  // Calculate spike position based on lastCrankAge
  // The line represents 24h window. Right edge = now, left edge = 24h ago.
  const windowSeconds = 24 * 60 * 60
  const crankAgeSeconds = program.lastCrankAge

  if (program.health === "active") {
    // Active programs: estimate crank frequency and fill the right side with spikes.
    // crankAgeSeconds is time since last crank. If < 120s, assume regular cranking.
    // Estimate frequency: if lastCrankAge is 70s, pattern repeats every 70s
    const freq = Math.max(crankAgeSeconds, 30) // minimum 30s
    const cranksIn24h = Math.min(windowSeconds / freq, CHARS)
    const spikeCount = Math.min(Math.floor(cranksIn24h), CHARS)

    // Fill from the right edge inward
    const spikeSpacing = spikeCount > 0 ? Math.max(1, Math.floor(CHARS / spikeCount)) : CHARS

    if (spikeSpacing <= 1) {
      // Very frequent cranks — fill most of the line
      for (let i = 0; i < CHARS; i++) {
        chars[i] = "\u2561" // ╡
        colors[i] = spikeColor
      }
      // Leave first few chars as baseline for visual contrast
      for (let i = 0; i < Math.min(3, CHARS); i++) {
        chars[i] = "\u2500"
        colors[i] = baseColor
      }
    } else {
      // Space out spikes from right to left
      for (let pos = CHARS - 1; pos >= 0 && pos >= CHARS - spikeCount * spikeSpacing; pos -= spikeSpacing) {
        if (pos >= 0 && pos < CHARS) {
          chars[pos] = "\u2502" // │
          colors[pos] = spikeColor
        }
        if (pos - 1 >= 0 && pos - 1 < CHARS) {
          chars[pos - 1] = "\u2561" // ╡
          colors[pos - 1] = spikeColor
        }
      }
    }
  } else {
    // Stale or idle: single spike at the position of the last crank
    const posFromRight = Math.min(
      Math.floor((crankAgeSeconds / windowSeconds) * CHARS),
      CHARS - 1
    )
    const spikePos = CHARS - 1 - posFromRight

    if (spikePos >= 0 && spikePos < CHARS) {
      chars[spikePos] = "\u2502" // │
      colors[spikePos] = spikeColor
    }
    if (spikePos - 1 >= 0) {
      chars[spikePos - 1] = "\u2561" // ╡
      colors[spikePos - 1] = spikeColor
    }
  }

  return { chars, colors }
}

function HeartbeatLine({ program }: { program: ProgramSummary }) {
  const { chars, colors } = buildHeartbeatLine(program)
  const color = healthColor(program.health)
  const isActive = program.health === "active"

  return (
    <div className="flex items-center gap-2 py-1 group">
      {/* Program name — fixed width */}
      <div className="w-[110px] shrink-0 flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "animate-pulse-live" : ""}`}
          style={{ backgroundColor: color }}
        />
        <span className="text-[9px] font-bold truncate" style={{ color }}>
          {programShort(program.label)}
        </span>
      </div>

      {/* Heartbeat line */}
      <div className="flex-1 overflow-hidden">
        <span className="font-mono text-[10px] leading-none whitespace-nowrap" style={{ letterSpacing: 0 }}>
          {chars.map((ch, i) => {
            const isLastSpike = isActive && i === chars.length - 1 && ch !== "\u2500"
            return (
              <span
                key={i}
                style={{ color: colors[i] }}
                className={isLastSpike ? "animate-heartbeat-pulse" : ""}
              >
                {ch}
              </span>
            )
          })}
        </span>
      </div>

      {/* Status + age */}
      <div className="w-[90px] shrink-0 text-right">
        <span className="text-[9px] text-[var(--terminal-dim)]">
          {isActive && program.lastCrankAge < 120
            ? `~${program.lastCrankAge}s avg`
            : formatAge(program.lastCrankAge)
          }
        </span>
      </div>
    </div>
  )
}

export function CrankHeartbeat({ programs }: { programs: ProgramSummary[] }) {
  // Sort: active first, then stale, idle, dead
  const order: Record<string, number> = { active: 0, stale: 1, idle: 2, dead: 3 }
  const sorted = [...programs].sort((a, b) => (order[a.health] ?? 9) - (order[b.health] ?? 9))

  return (
    <TerminalPanel title="Crank Heartbeat">
      <div className="flex flex-col">
        {sorted.map((p) => (
          <HeartbeatLine key={p.id} program={p} />
        ))}
      </div>
      <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-[var(--terminal-border)] text-[8px] text-[var(--terminal-dim)]">
        <span>{"\u2500\u2500\u2500"} 24h window {"\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"} now {"\u25B6\u2502"}</span>
      </div>
    </TerminalPanel>
  )
}
