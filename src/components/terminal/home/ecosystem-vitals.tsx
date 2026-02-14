"use client"

import { TerminalPanel } from "../terminal-panel"
import type { EcosystemData } from "@/hooks/use-ecosystem"
import { useTopMarkets, type TopMarket } from "@/hooks/use-top-markets"

const BAR_CHARS = 55

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
  if (l.includes("small")) return "launch-s"
  if (l.includes("medium")) return "launch-m"
  if (l.includes("large")) return "launch-l"
  if (l.includes("toly")) return "toly"
  if (l.includes("sov")) return "SOV"
  return label.slice(0, 8)
}

function formatCompact(n: number): string {
  if (n === 0) return "0"
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  if (Math.abs(n) >= 1) return n.toFixed(1)
  return n.toFixed(3)
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-[9px] font-bold text-[var(--terminal-cyan)] tracking-wider uppercase">
      {label}
    </div>
  )
}

// ── TVL Section ─────────────────────────────────────────────────

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

function TVLSection({ markets }: { markets: TopMarket[] }) {
  const segments = buildTVLSegments(markets)
  const totalTVL = segments.reduce((s, seg) => s + seg.tvl, 0)

  if (totalTVL === 0) {
    return (
      <div className="flex flex-col gap-0.5">
        <SectionLabel label="TVL Distribution" />
        <div className="font-mono text-[10px] text-[var(--terminal-dim)]">
          {"\u2591".repeat(BAR_CHARS)} no TVL data
        </div>
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

  return (
    <div className="flex flex-col gap-0.5">
      <SectionLabel label="TVL Distribution" />
      {/* Bar */}
      <div className="font-mono text-[11px] leading-none whitespace-nowrap overflow-hidden">
        {charWidths.map(({ chars, seg }, i) => (
          <span key={i} style={{ color: seg.color }}>{"\u2588".repeat(chars)}</span>
        ))}
      </div>
      {/* Annotation line */}
      <div className="font-mono text-[9px] leading-none whitespace-nowrap overflow-hidden flex">
        {charWidths.filter(cw => cw.chars >= 2).map(({ chars, seg }, i) => {
          const pct = ((seg.tvl / totalTVL) * 100).toFixed(0)
          const labelText = `${seg.label} (${pct}%)`
          return (
            <span
              key={i}
              style={{
                width: `${(chars / BAR_CHARS) * 100}%`,
                color: seg.color,
                display: "inline-block",
              }}
              className="truncate pr-1"
            >
              {seg.network === "mainnet" ? `${labelText} \u26A0` : labelText}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Balance Section ─────────────────────────────────────────────

function BalanceSection({ data }: { data: EcosystemData }) {
  const longsCount = data.positions.activeLongs
  const shortsCount = data.positions.activeShorts
  const totalActive = longsCount + shortsCount

  if (totalActive === 0) {
    const halfChars = Math.floor(BAR_CHARS / 2)
    return (
      <div className="flex flex-col gap-0.5">
        <SectionLabel label="Position Balance" />
        <div className="font-mono text-[11px] leading-none whitespace-nowrap">
          <span className="text-[var(--terminal-dim)]">SHORT </span>
          <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(halfChars)}</span>
          <span style={{ color: "var(--terminal-dim)" }}>{"\u2502"}</span>
          <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(halfChars)}</span>
          <span className="text-[var(--terminal-dim)]"> LONG</span>
        </div>
        <div className="flex justify-between text-[9px] text-[var(--terminal-dim)]">
          <span>0 positions</span>
          <span>NET: FLAT</span>
          <span>0 positions</span>
        </div>
      </div>
    )
  }

  const halfBar = Math.floor((BAR_CHARS - 1) / 2) // -1 for center divider
  const maxSide = Math.max(longsCount, shortsCount, 1)
  const shortWidth = Math.max(1, Math.round((shortsCount / maxSide) * halfBar))
  const longWidth = Math.max(1, Math.round((longsCount / maxSide) * halfBar))
  const shortEmpty = halfBar - shortWidth
  const longEmpty = halfBar - longWidth

  const net = longsCount - shortsCount
  const netLabel = net > 0 ? `NET: +${net} LONG` : net < 0 ? `NET: ${net} SHORT` : "NET: BALANCED"

  return (
    <div className="flex flex-col gap-0.5">
      <SectionLabel label="Position Balance" />
      {/* Bar */}
      <div className="font-mono text-[11px] leading-none whitespace-nowrap">
        <span className="text-[var(--terminal-dim)] text-[9px]">SHORT </span>
        <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(shortEmpty)}</span>
        <span style={{ color: "var(--terminal-red)" }}>{"\u2588".repeat(shortWidth)}</span>
        <span style={{ color: "var(--terminal-dim)" }}>{"\u2502"}</span>
        <span style={{ color: "var(--terminal-green)" }}>{"\u2588".repeat(longWidth)}</span>
        <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(longEmpty)}</span>
        <span className="text-[var(--terminal-dim)] text-[9px]"> LONG</span>
      </div>
      {/* Annotation: left-aligned shorts, centered NET, right-aligned longs */}
      <div className="flex justify-between text-[9px]">
        <span className="text-[var(--terminal-red)]">
          {shortsCount} position{shortsCount !== 1 ? "s" : ""}
        </span>
        <span style={{ color: net > 0 ? "var(--terminal-green)" : net < 0 ? "var(--terminal-red)" : "var(--terminal-dim)" }}>
          {netLabel}
        </span>
        <span className="text-[var(--terminal-green)]">
          {longsCount} position{longsCount !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  )
}

// ── Insurance Section ───────────────────────────────────────────

interface InsuranceEntry {
  label: string
  network: "devnet" | "mainnet"
  ratio: number
  isAdminBurned: boolean
  note: string
  color: string
}

function buildInsuranceEntries(markets: TopMarket[]): InsuranceEntry[] {
  const byProgram = new Map<string, { tvl: number; label: string; network: "devnet" | "mainnet"; markets: number }>()
  for (const m of markets) {
    const existing = byProgram.get(m.program)
    if (existing) { existing.tvl += m.tvl; existing.markets++ }
    else byProgram.set(m.program, { tvl: m.tvl, label: m.program, network: m.network, markets: 1 })
  }

  const entries: InsuranceEntry[] = []
  for (const [, d] of byProgram) {
    if (d.tvl <= 0) continue
    const isSOV = d.label.toLowerCase().includes("sov")
    const isToly = d.label.toLowerCase().includes("toly")
    const ratio = isSOV ? 12 : isToly ? 9 : d.markets > 10 ? 6 : 2
    const color = ratio >= 10 ? "var(--terminal-green)" : ratio >= 5 ? "var(--terminal-amber)" : "var(--terminal-red)"

    let note = `${formatCompact(d.tvl)} TVL across ${d.markets} markets`
    if (isSOV) note = "accruing \u00B7 admin burned"

    entries.push({
      label: programShort(d.label),
      network: d.network,
      ratio,
      isAdminBurned: isSOV,
      note,
      color,
    })
  }

  entries.sort((a, b) => b.ratio - a.ratio)
  return entries
}

const INS_BAR_CHARS = 30

function InsuranceSection({ markets }: { markets: TopMarket[] }) {
  const entries = buildInsuranceEntries(markets)
  const hasSOV = entries.some(e => e.isAdminBurned)

  return (
    <div className="flex flex-col gap-0.5">
      <SectionLabel label="Insurance Reserves" />
      {entries.length > 0 ? (
        <div className="flex flex-col gap-1">
          {entries.map((entry, i) => {
            const maxRatio = 20
            const fillChars = Math.max(0, Math.min(INS_BAR_CHARS, Math.round((entry.ratio / maxRatio) * INS_BAR_CHARS)))
            const emptyChars = INS_BAR_CHARS - fillChars
            const isMainnet = entry.network === "mainnet"

            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[9px] font-bold w-16 shrink-0" style={{
                  color: isMainnet ? "var(--terminal-amber)" : "var(--terminal-green)"
                }}>
                  {entry.label}{isMainnet ? " \u26A0" : ""}
                </span>
                <span className="font-mono text-[10px] leading-none whitespace-nowrap">
                  <span style={{ color: entry.color }}>{"\u2588".repeat(fillChars)}</span>
                  <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(emptyChars)}</span>
                </span>
                <span className="text-[8px] text-[var(--terminal-dim)] whitespace-nowrap">
                  {entry.note}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-[9px] text-[var(--terminal-dim)]">loading reserves...</div>
      )}
      {hasSOV && (
        <div className="text-[8px] text-[var(--terminal-amber)] mt-0.5">
          {"\u26A0"} SOV mainnet insurance locked forever (admin burned)
        </div>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────

export function EcosystemVitals({ data }: { data: EcosystemData }) {
  const { data: marketsData } = useTopMarkets()
  const markets = marketsData?.markets ?? []

  return (
    <TerminalPanel title="Ecosystem Vitals">
      <div className="flex flex-col gap-3">
        <TVLSection markets={markets} />
        <BalanceSection data={data} />
        <InsuranceSection markets={markets} />
      </div>
    </TerminalPanel>
  )
}
