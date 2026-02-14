"use client"

import { useNavigation } from "@/hooks/use-navigation"
import { TerminalPanel } from "../terminal-panel"
import { ExplorerLink } from "../explorer-link"
import type { ProgramSummary } from "@/hooks/use-ecosystem"

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
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

function ProgramStatusCard({ program }: { program: ProgramSummary }) {
  const { setActiveView } = useNavigation()
  const color = healthColor(program.health)

  return (
    <div
      className="flex items-center justify-between py-1 px-2 border-b border-[var(--terminal-border)] hover:bg-[var(--terminal-hover)] transition-colors cursor-pointer group"
      onClick={() => setActiveView("radar")}
      title="View in Radar"
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${program.health === "active" ? "animate-pulse-live" : ""}`}
          style={{ backgroundColor: color }}
        />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-[var(--terminal-green)] group-hover:text-[var(--terminal-amber)] transition-colors">
              {program.label.toUpperCase()}
            </span>
            <span
              className="px-0.5 text-[7px] font-bold uppercase border"
              style={{
                color: program.network === "mainnet" ? "var(--terminal-green)" : "var(--terminal-amber)",
                borderColor: program.network === "mainnet" ? "var(--terminal-green)" : "var(--terminal-amber)",
              }}
            >
              {program.network}
            </span>
            <ExplorerLink type="address" address={program.programId} network={program.network} />
          </div>
          <div className="flex items-center gap-x-2 text-[9px] text-[var(--terminal-dim)]">
            <span>{program.slabCount} slabs</span>
            <span>{program.accountCount.toLocaleString()} accts</span>
            {program.lastCrankAge > 0 && (
              <span>
                crank: <span style={{ color: program.lastCrankAge < 60 ? "var(--terminal-green)" : program.lastCrankAge < 3600 ? "var(--terminal-amber)" : "var(--terminal-red)" }}>
                  {formatAge(program.lastCrankAge)}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      <span className="text-[9px] font-bold uppercase shrink-0 ml-1" style={{ color }}>
        {program.health}
      </span>
    </div>
  )
}

export function ProgramStatus({ programs }: { programs: ProgramSummary[] }) {
  // Sort: active first, then stale, idle, dead
  const order: Record<string, number> = { active: 0, stale: 1, idle: 2, dead: 3 }
  const sorted = [...programs].sort((a, b) => (order[a.health] ?? 9) - (order[b.health] ?? 9))

  return (
    <TerminalPanel title="Program Status">
      <div className="flex flex-col gap-0">
        {sorted.map((p) => (
          <ProgramStatusCard key={p.id} program={p} />
        ))}
      </div>
    </TerminalPanel>
  )
}
