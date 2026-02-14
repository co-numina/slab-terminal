"use client"

import { useState } from "react"
import { useRadarData, type ProgramRadar, type SlabRadar, type HealthStatus } from "@/hooks/use-radar-data"
import { useNavigation } from "@/hooks/use-navigation"
import { TerminalPanel } from "./terminal-panel"
import { ExplorerLink, truncateAddress } from "./explorer-link"

// ── Health helpers ──────────────────────────────────────────────────────

function healthColor(health: HealthStatus): string {
  switch (health) {
    case "active":
      return "var(--terminal-green)"
    case "stale":
      return "var(--terminal-amber)"
    case "idle":
      return "var(--terminal-dim)"
    case "dead":
      return "var(--terminal-red)"
  }
}

function healthLabel(health: HealthStatus): string {
  return health.toUpperCase()
}

function HealthBadge({ health }: { health: HealthStatus }) {
  const color = healthColor(health)
  const isActive = health === "active"
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${isActive ? "animate-pulse-live" : ""}`}
        style={{ backgroundColor: color }}
      />
      <span className="text-[10px] font-bold uppercase" style={{ color }}>
        {healthLabel(health)}
      </span>
    </span>
  )
}

function NetworkBadge({ network }: { network: "devnet" | "mainnet" }) {
  const color = network === "mainnet" ? "var(--terminal-green)" : "var(--terminal-amber)"
  return (
    <span
      className="px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider border"
      style={{ color, borderColor: color }}
    >
      {network}
    </span>
  )
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

function formatSlabSize(bytes: number): string {
  if (bytes >= 900000) return "992KB"
  if (bytes >= 200000) return "249KB"
  return "62KB"
}

// ── Slab Row ────────────────────────────────────────────────────────────

function SlabRow({ slab, network, programLabel, programId }: { slab: SlabRadar; network: "devnet" | "mainnet"; programLabel: string; programId: string }) {
  const color = healthColor(slab.health)
  const { navigateToSlab } = useNavigation()

  return (
    <div
      className="flex items-center justify-between py-0.5 px-2 text-[10px] hover:bg-[var(--terminal-hover)] transition-colors cursor-pointer group"
      onClick={() => navigateToSlab(slab.pubkey, programLabel, network, programId)}
      title={`Drill into ${slab.pubkey}`}
    >
      <div className="flex items-center gap-2">
        <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-[var(--terminal-dim)]">{slab.label}</span>
        <span className="text-[var(--terminal-cyan)] font-mono group-hover:text-[var(--terminal-green)] transition-colors">
          {truncateAddress(slab.pubkey, 4)}
        </span>
        <ExplorerLink type="address" address={slab.pubkey} network={network} />
        <span className="text-[9px] text-[var(--terminal-dim)] group-hover:text-[var(--terminal-amber)] transition-colors">
          {"▶ DRILL"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[var(--terminal-dim)]">{slab.numUsedAccounts} accts</span>
        <span className="text-[9px] text-[var(--terminal-dim)]">{formatSlabSize(slab.slabSize)}</span>
        <span className="text-[10px] font-bold" style={{ color }}>
          {healthLabel(slab.health)}
        </span>
      </div>
    </div>
  )
}

// ── Program Card ────────────────────────────────────────────────────────

function ProgramCard({ program }: { program: ProgramRadar }) {
  const [expanded, setExpanded] = useState(false)
  const accentColor = healthColor(program.health)
  const hasSlabs = program.slabs.length > 0

  return (
    <div className="border border-[var(--terminal-border)]">
      {/* Card header */}
      <div
        className="flex items-center justify-between border-b border-[var(--terminal-border)] bg-[var(--terminal-bg)] px-3 py-1.5"
        style={{ borderLeft: `2px solid ${accentColor}` }}
      >
        <div className="flex items-center gap-2">
          <HealthBadge health={program.health} />
          <span className="text-xs font-bold text-[var(--terminal-green)]">
            {program.label.toUpperCase()}
          </span>
          <NetworkBadge network={program.network} />
        </div>
        <ExplorerLink type="address" address={program.programId} network={program.network} />
      </div>

      {/* Stats */}
      <div className="flex flex-col gap-1 px-3 py-2">
        {/* Program ID */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-[var(--terminal-dim)]">PROGRAM</span>
          <span className="text-[var(--terminal-cyan)] font-mono">
            {truncateAddress(program.programId, 6)}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]">
          <span className="text-[var(--terminal-dim)]">
            SLABS: <span className="font-bold text-[var(--terminal-green)]">{program.slabCount}</span>
            {program.activeSlabCount !== program.slabCount && (
              <span className="text-[var(--terminal-dim)]"> ({program.activeSlabCount} active)</span>
            )}
          </span>
          <span className="text-[var(--terminal-dim)]">
            ACCOUNTS: <span className="font-bold text-[var(--terminal-cyan)]">{program.accountCount}</span>
          </span>
          {program.lastCrankAge > 0 && (
            <span className="text-[var(--terminal-dim)]">
              LAST CRANK:{" "}
              <span
                className="font-bold"
                style={{
                  color:
                    program.lastCrankAge < 60
                      ? "var(--terminal-green)"
                      : program.lastCrankAge < 3600
                        ? "var(--terminal-amber)"
                        : "var(--terminal-red)",
                }}
              >
                {formatAge(program.lastCrankAge)} ago
              </span>
            </span>
          )}
        </div>

        {/* Description */}
        {program.description && (
          <div className="text-[9px] text-[var(--terminal-dim)] mt-0.5">
            {program.description}
          </div>
        )}

        {/* Error */}
        {program.error && (
          <div className="text-[10px] text-[var(--terminal-red)] mt-1">
            ERROR: {program.error.length > 80 ? program.error.slice(0, 80) + "..." : program.error}
          </div>
        )}

        {/* Expandable slab list */}
        {hasSlabs && (
          <div className="border-t border-[var(--terminal-border)] mt-1 pt-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex w-full items-center gap-2 py-0.5 text-[10px] text-[var(--terminal-dim)] hover:text-[var(--terminal-amber)] transition-colors select-none"
            >
              <span className="text-[var(--terminal-amber)]">{expanded ? "\u25bc" : "\u25b6"}</span>
              <span className="uppercase tracking-wider">
                SLABS ({program.slabs.length})
              </span>
              <span className="flex-1 border-t border-dashed border-[var(--terminal-border)]" />
              <span className="text-[9px]">
                {expanded ? "COLLAPSE" : "EXPAND"}
              </span>
            </button>
            {expanded && (
              <div className="flex flex-col mt-1">
                {program.slabs.map((slab) => (
                  <SlabRow key={slab.pubkey} slab={slab} network={program.network} programLabel={program.label} programId={program.programId} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Totals Bar ──────────────────────────────────────────────────────────

function TotalsBar({ data }: { data: NonNullable<ReturnType<typeof useRadarData>["data"]> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 py-1.5 text-[10px] border-b border-[var(--terminal-border)]">
      <span className="text-[var(--terminal-dim)]">
        PROGRAMS: <span className="font-bold text-[var(--terminal-green)]">{data.totals.totalPrograms}</span>
      </span>
      <span className="text-[var(--terminal-dim)]">
        SLABS: <span className="font-bold text-[var(--terminal-green)]">{data.totals.totalSlabs}</span>
        {data.totals.totalActiveSlabs !== data.totals.totalSlabs && (
          <span> ({data.totals.totalActiveSlabs} active)</span>
        )}
      </span>
      <span className="text-[var(--terminal-dim)]">
        ACCOUNTS: <span className="font-bold text-[var(--terminal-cyan)]">{data.totals.totalAccounts}</span>
      </span>
      <span className="text-[var(--terminal-dim)]">
        ACTIVE: <span className="font-bold text-[var(--terminal-green)]">{data.totals.activePrograms}</span>
      </span>
      {data.totals.stalePrograms > 0 && (
        <span className="text-[var(--terminal-dim)]">
          STALE: <span className="font-bold text-[var(--terminal-amber)]">{data.totals.stalePrograms}</span>
        </span>
      )}
      {data.totals.idlePrograms > 0 && (
        <span className="text-[var(--terminal-dim)]">
          IDLE: <span className="font-bold text-[var(--terminal-dim)]">{data.totals.idlePrograms}</span>
        </span>
      )}
      {data.totals.deadPrograms > 0 && (
        <span className="text-[var(--terminal-dim)]">
          DEAD: <span className="font-bold text-[var(--terminal-red)]">{data.totals.deadPrograms}</span>
        </span>
      )}
      <span className="text-[9px] text-[var(--terminal-dim)] ml-auto">
        SCAN: {data.scanDurationMs}ms
      </span>
    </div>
  )
}

// ── Network Filter ──────────────────────────────────────────────────────

type NetworkFilter = "all" | "devnet" | "mainnet"

function NetworkFilterBar({
  filter,
  setFilter,
  networks,
}: {
  filter: NetworkFilter
  setFilter: (f: NetworkFilter) => void
  networks: NonNullable<ReturnType<typeof useRadarData>["data"]>["networks"]
}) {
  const tabs: { id: NetworkFilter; label: string }[] = [
    { id: "all", label: "ALL" },
    { id: "devnet", label: `DEVNET (${networks.devnet.programs})` },
    { id: "mainnet", label: `MAINNET (${networks.mainnet.programs})` },
  ]

  return (
    <div className="flex items-center gap-1 px-1 py-1 border-b border-[var(--terminal-border)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setFilter(tab.id)}
          className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border transition-all select-none ${
            filter === tab.id
              ? "border-[var(--terminal-green)] text-[var(--terminal-green)]"
              : "border-[var(--terminal-border)] text-[var(--terminal-dim)] hover:text-[var(--terminal-green)] hover:border-[var(--terminal-green)]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ── Main Radar Panel ────────────────────────────────────────────────────

export function RadarPanel() {
  const { data, isLoading, error } = useRadarData()
  const [filter, setFilter] = useState<NetworkFilter>("all")

  if (isLoading || !data) {
    return (
      <TerminalPanel title="Ecosystem Radar" className="h-full">
        <div className="flex items-center justify-center py-8">
          <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
          <span className="ml-2 text-[10px] text-[var(--terminal-dim)]">SCANNING ECOSYSTEM...</span>
        </div>
      </TerminalPanel>
    )
  }

  const filteredPrograms =
    filter === "all"
      ? data.programs
      : data.programs.filter((p) => p.network === filter)

  // Sort: active first, then stale, idle, dead
  const healthOrder: Record<string, number> = { active: 0, stale: 1, idle: 2, dead: 3 }
  const sorted = [...filteredPrograms].sort(
    (a, b) => (healthOrder[a.health] ?? 9) - (healthOrder[b.health] ?? 9),
  )

  return (
    <TerminalPanel title="Ecosystem Radar" className="h-full" stale={!!error}>
      <TotalsBar data={data} />
      <NetworkFilterBar filter={filter} setFilter={setFilter} networks={data.networks} />

      <div className="flex flex-col gap-2 mt-2 max-h-[calc(100vh-280px)] overflow-y-auto">
        {sorted.map((program) => (
          <ProgramCard key={program.id} program={program} />
        ))}
        {sorted.length === 0 && (
          <div className="flex items-center justify-center py-4">
            <span className="text-[10px] text-[var(--terminal-dim)]">
              NO PROGRAMS FOUND FOR {filter.toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </TerminalPanel>
  )
}
