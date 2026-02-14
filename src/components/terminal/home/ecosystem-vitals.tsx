"use client"

import { TerminalPanel } from "../terminal-panel"
import type { EcosystemData, ProgramSummary } from "@/hooks/use-ecosystem"
import { useTopMarkets, type TopMarket } from "@/hooks/use-top-markets"

const BAR_CHARS = 50

// ── Shared helpers ──────────────────────────────────────────────

function programColor(label: string, network: string): string {
  const l = label.toLowerCase()
  if (l.includes("sov")) return "var(--terminal-amber)"
  if (l.includes("toly")) return "var(--terminal-green)"
  if (l.includes("small")) return "var(--terminal-cyan)"
  if (l.includes("large")) return "#00ff4177"
  if (l.includes("medium")) return "#ff444433"
  return "var(--terminal-dim)"
}

function programShort(label: string): string {
  const l = label.toLowerCase()
  if (l.includes("small")) return "s"
  if (l.includes("medium")) return "m"
  if (l.includes("large")) return "l"
  if (l.includes("toly")) return "toly"
  if (l.includes("sov")) return "SOV"
  return label.slice(0, 4)
}

function formatCompact(n: number): string {
  if (n === 0) return "0"
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  if (Math.abs(n) >= 1) return n.toFixed(1)
  return n.toFixed(3)
}

// ── TVL Row ─────────────────────────────────────────────────────

interface TVLSegment {
  label: string
  tvl: number
  network: "devnet" | "mainnet"
  color: string
}

function buildTVLSegments(markets: TopMarket[]): TVLSegment[] {
  const byProgram = new Map<string, { tvl: number; label: string; network: "devnet" | "mainnet" }>()
  for (const m of markets) {
    const existing = byProgram.get(m.program)
    if (existing) existing.tvl += m.tvl
    else byProgram.set(m.program, { tvl: m.tvl, label: m.program, network: m.network })
  }

  const segments: TVLSegment[] = []
  for (const [, v] of byProgram) {
    if (v.tvl <= 0) continue
    segments.push({
      label: programShort(v.label),
      tvl: v.tvl,
      network: v.network,
      color: programColor(v.label, v.network),
    })
  }
  segments.sort((a, b) => b.tvl - a.tvl)
  return segments
}

function TVLRow({ markets }: { markets: TopMarket[] }) {
  const segments = buildTVLSegments(markets)
  const totalTVL = segments.reduce((s, seg) => s + seg.tvl, 0)

  if (totalTVL === 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-[var(--terminal-dim)] w-8 shrink-0">TVL</span>
        <span className="font-mono text-[10px] text-[var(--terminal-dim)]">
          {"\u2591".repeat(BAR_CHARS)}
        </span>
        <span className="text-[8px] text-[var(--terminal-dim)]">no data</span>
      </div>
    )
  }

  // Compute char widths
  const charWidths: { chars: number; seg: TVLSegment }[] = []
  let usedChars = 0
  for (let i = 0; i < segments.length; i++) {
    const pct = segments[i].tvl / totalTVL
    const chars = i === segments.length - 1
      ? BAR_CHARS - usedChars
      : Math.max(1, Math.round(pct * BAR_CHARS))
    charWidths.push({ chars: Math.min(chars, BAR_CHARS - usedChars), seg: segments[i] })
    usedChars += charWidths[i].chars
  }

  // Build legend string
  const legend = segments
    .map(s => `${s.label}:${formatCompact(s.tvl)}`)
    .join(" ")

  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-[var(--terminal-dim)] w-8 shrink-0 font-bold">TVL</span>
      <span className="font-mono text-[10px] leading-none whitespace-nowrap">
        {charWidths.map(({ chars, seg }, i) => (
          <span key={i} style={{ color: seg.color }}>{"\u2588".repeat(chars)}</span>
        ))}
      </span>
      <span className="text-[8px] text-[var(--terminal-dim)] whitespace-nowrap truncate">
        {legend}
      </span>
    </div>
  )
}

// ── Balance Row ─────────────────────────────────────────────────

function BalanceRow({ data }: { data: EcosystemData }) {
  const longsCount = data.positions.activeLongs
  const shortsCount = data.positions.activeShorts
  const totalActive = longsCount + shortsCount

  if (totalActive === 0) {
    const halfChars = Math.floor(BAR_CHARS / 2)
    return (
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-[var(--terminal-dim)] w-8 shrink-0 font-bold">BAL</span>
        <span className="font-mono text-[10px] leading-none whitespace-nowrap">
          <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(halfChars)}</span>
          <span style={{ color: "var(--terminal-dim)" }}>{"\u2502"}</span>
          <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(halfChars)}</span>
        </span>
        <span className="text-[8px] text-[var(--terminal-dim)]">FLAT</span>
      </div>
    )
  }

  const halfBar = Math.floor(BAR_CHARS / 2)
  const maxSide = Math.max(longsCount, shortsCount, 1)
  const shortWidth = Math.max(1, Math.round((shortsCount / maxSide) * halfBar))
  const longWidth = Math.max(1, Math.round((longsCount / maxSide) * halfBar))
  const shortEmpty = halfBar - shortWidth
  const longEmpty = halfBar - longWidth

  const net = longsCount - shortsCount
  const netLabel = net > 0 ? `+${net}L` : net < 0 ? `${net}S` : "="

  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-[var(--terminal-dim)] w-8 shrink-0 font-bold">BAL</span>
      <span className="font-mono text-[10px] leading-none whitespace-nowrap">
        <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(shortEmpty)}</span>
        <span style={{ color: "var(--terminal-red)" }}>{"\u2588".repeat(shortWidth)}</span>
        <span style={{ color: "var(--terminal-dim)" }}>{"\u2502"}</span>
        <span style={{ color: "var(--terminal-green)" }}>{"\u2588".repeat(longWidth)}</span>
        <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(longEmpty)}</span>
      </span>
      <span className="text-[8px] text-[var(--terminal-dim)] whitespace-nowrap">
        {shortsCount}S/{longsCount}L{" "}
        <span style={{ color: net > 0 ? "var(--terminal-green)" : net < 0 ? "var(--terminal-red)" : "var(--terminal-dim)" }}>
          {netLabel}
        </span>
      </span>
    </div>
  )
}

// ── Insurance Row ───────────────────────────────────────────────

function InsuranceRow({ markets }: { markets: TopMarket[] }) {
  // Aggregate insurance estimate per program
  const byProgram = new Map<string, { tvl: number; label: string; network: "devnet" | "mainnet"; markets: number }>()
  for (const m of markets) {
    const existing = byProgram.get(m.program)
    if (existing) { existing.tvl += m.tvl; existing.markets++ }
    else byProgram.set(m.program, { tvl: m.tvl, label: m.program, network: m.network, markets: 1 })
  }

  // Estimate a composite insurance ratio
  let totalTVL = 0
  let weightedRatio = 0
  let hasSOV = false
  for (const [, d] of byProgram) {
    const isSOV = d.label.toLowerCase().includes("sov")
    const isToly = d.label.toLowerCase().includes("toly")
    const ratio = isSOV ? 12 : isToly ? 9 : d.markets > 10 ? 6 : 2
    weightedRatio += ratio * d.tvl
    totalTVL += d.tvl
    if (isSOV) hasSOV = true
  }
  const avgRatio = totalTVL > 0 ? weightedRatio / totalTVL : 0
  const maxRatio = 20
  const fillChars = Math.max(0, Math.min(BAR_CHARS, Math.round((avgRatio / maxRatio) * BAR_CHARS)))
  const emptyChars = BAR_CHARS - fillChars

  const color = avgRatio >= 10 ? "var(--terminal-green)" : avgRatio >= 5 ? "var(--terminal-amber)" : "var(--terminal-red)"

  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-[var(--terminal-dim)] w-8 shrink-0 font-bold">INS</span>
      <span className="font-mono text-[10px] leading-none whitespace-nowrap">
        <span style={{ color }}>{"\u2588".repeat(fillChars)}</span>
        <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(emptyChars)}</span>
      </span>
      <span className="text-[8px] text-[var(--terminal-dim)] whitespace-nowrap">
        ~{avgRatio.toFixed(0)}% avg
        {hasSOV && <span className="text-[var(--terminal-amber)]"> {"\u26A0"}SOV locked</span>}
      </span>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────

export function EcosystemVitals({ data }: { data: EcosystemData }) {
  const { data: marketsData } = useTopMarkets()
  const markets = marketsData?.markets ?? []

  return (
    <TerminalPanel title="Ecosystem Vitals">
      <div className="flex flex-col gap-1.5">
        <TVLRow markets={markets} />
        <BalanceRow data={data} />
        <InsuranceRow markets={markets} />
      </div>
    </TerminalPanel>
  )
}
