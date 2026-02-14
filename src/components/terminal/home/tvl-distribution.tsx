"use client"

import { TerminalPanel } from "../terminal-panel"
import type { EcosystemData, ProgramSummary } from "@/hooks/use-ecosystem"
import { useTopMarkets, type TopMarket } from "@/hooks/use-top-markets"

interface TVLSegment {
  program: string
  label: string
  tvl: number
  network: "devnet" | "mainnet"
  color: string
}

const BAR_CHARS = 60

function programColor(label: string, network: string): string {
  const l = label.toLowerCase()
  if (l.includes("sov")) return "var(--terminal-amber)" // mainnet
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
  return n.toFixed(1)
}

/**
 * Build TVL segments from top markets data, grouped by program.
 */
function buildSegments(markets: TopMarket[]): TVLSegment[] {
  const byProgram = new Map<string, { tvl: number; label: string; network: "devnet" | "mainnet" }>()

  for (const m of markets) {
    const existing = byProgram.get(m.program)
    if (existing) {
      existing.tvl += m.tvl
    } else {
      byProgram.set(m.program, { tvl: m.tvl, label: m.program, network: m.network })
    }
  }

  const segments: TVLSegment[] = []
  for (const [, v] of byProgram) {
    if (v.tvl <= 0) continue
    segments.push({
      program: v.label,
      label: programShort(v.label),
      tvl: v.tvl,
      network: v.network,
      color: programColor(v.label, v.network),
    })
  }

  // Sort by TVL desc
  segments.sort((a, b) => b.tvl - a.tvl)
  return segments
}

function TVLBar({ segments }: { segments: TVLSegment[] }) {
  const totalTVL = segments.reduce((s, seg) => s + seg.tvl, 0)
  if (totalTVL === 0) {
    return (
      <div className="font-mono text-[10px] text-[var(--terminal-dim)]">
        {"\u2591".repeat(BAR_CHARS)} no TVL data
      </div>
    )
  }

  // Compute character widths
  const charWidths: { chars: number; segment: TVLSegment }[] = []
  let usedChars = 0

  for (let i = 0; i < segments.length; i++) {
    const pct = segments[i].tvl / totalTVL
    const chars = i === segments.length - 1
      ? BAR_CHARS - usedChars // last segment gets remaining
      : Math.max(1, Math.round(pct * BAR_CHARS))
    charWidths.push({ chars: Math.min(chars, BAR_CHARS - usedChars), segment: segments[i] })
    usedChars += charWidths[i].chars
  }

  return (
    <div className="flex flex-col gap-1">
      {/* The bar */}
      <div className="font-mono text-[11px] leading-none whitespace-nowrap overflow-hidden">
        {charWidths.map(({ chars, segment }, i) => (
          <span key={i}>
            <span style={{ color: segment.color }}>
              {"\u2588".repeat(chars)}
            </span>
            {i < charWidths.length - 1 && (
              <span style={{ color: "var(--terminal-bg)" }}>{""}</span>
            )}
          </span>
        ))}
      </div>

      {/* Labels below bar */}
      <div className="font-mono text-[9px] leading-none whitespace-nowrap overflow-hidden flex">
        {charWidths.filter(cw => cw.chars >= 3).map(({ chars, segment }, i) => {
          const pct = ((segment.tvl / totalTVL) * 100).toFixed(0)
          const labelText = `${segment.label} (${pct}%)`
          return (
            <span
              key={i}
              style={{
                width: `${(chars / BAR_CHARS) * 100}%`,
                color: segment.color,
                display: "inline-block",
              }}
              className="truncate pr-1"
            >
              {segment.network === "mainnet" ? `${labelText} \u26A0` : labelText}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function TVLDistribution({ data }: { data: EcosystemData }) {
  const { data: marketsData } = useTopMarkets()

  const segments = marketsData ? buildSegments(marketsData.markets) : []
  const hasSegments = segments.length > 0

  // Compute devnet/mainnet totals from ecosystem data
  const devnetTVL = Object.entries(data.tvl)
    .filter(([k]) => k.endsWith("_devnet"))
    .reduce((s, [, v]) => s + v.amount, 0)
  const mainnetTVL = Object.entries(data.tvl)
    .filter(([k]) => k.endsWith("_mainnet"))
    .reduce((s, [, v]) => s + v.amount, 0)

  // Get symbols
  const devnetSymbols = Object.entries(data.tvl)
    .filter(([k]) => k.endsWith("_devnet"))
    .map(([k, v]) => `${formatCompact(v.amount)} ${k.split("_")[0]}`)
    .join(" + ")
  const mainnetSymbols = Object.entries(data.tvl)
    .filter(([k]) => k.endsWith("_mainnet"))
    .map(([k, v]) => `${formatCompact(v.amount)} ${k.split("_")[0]}`)
    .join(" + ")

  return (
    <TerminalPanel title="TVL Distribution">
      {hasSegments ? (
        <TVLBar segments={segments} />
      ) : (
        <div className="font-mono text-[10px] text-[var(--terminal-dim)]">
          {"\u2591".repeat(BAR_CHARS)} loading...
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-0.5 mt-2 text-[9px]">
        {devnetTVL > 0 && (
          <span className="text-[var(--terminal-dim)]">
            DEVNET: <span className="text-[var(--terminal-green)]">{devnetSymbols || formatCompact(devnetTVL)}</span>
            {" "}across {data.networks.devnet.programs} programs
          </span>
        )}
        {mainnetTVL > 0 && (
          <span className="text-[var(--terminal-amber)]">
            MAINNET: {mainnetSymbols || formatCompact(mainnetTVL)}
            {" "}across {data.networks.mainnet.programs} program {"\u2014"} real value at stake
          </span>
        )}
      </div>
    </TerminalPanel>
  )
}
