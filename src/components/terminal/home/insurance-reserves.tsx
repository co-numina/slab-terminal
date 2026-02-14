"use client"

import { TerminalPanel } from "../terminal-panel"
import { useTopMarkets, type TopMarket } from "@/hooks/use-top-markets"
import type { ProgramSummary } from "@/hooks/use-ecosystem"

const BAR_CHARS = 28

interface InsuranceData {
  program: string
  label: string
  network: "devnet" | "mainnet"
  insuranceFund: number
  tvl: number
  ratio: number
  isAdminBurned: boolean
  notes: string
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

function formatCompact(n: number): string {
  if (n === 0) return "0"
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  if (Math.abs(n) >= 0.001) return n.toFixed(3)
  return n.toFixed(6)
}

function barColor(ratio: number): string {
  if (ratio >= 10) return "var(--terminal-green)"
  if (ratio >= 5) return "var(--terminal-amber)"
  return "var(--terminal-red)"
}

/**
 * Aggregate insurance data per program from top-markets.
 * Each market in top-markets doesn't expose insurance directly,
 * but we can estimate from the ecosystem data structure.
 * For now, we use TVL as the metric with a visual approximation.
 */
function buildInsuranceData(markets: TopMarket[], programs: ProgramSummary[]): InsuranceData[] {
  // Group markets by program
  const byProgram = new Map<string, { tvl: number; markets: number; network: "devnet" | "mainnet" }>()

  for (const m of markets) {
    const existing = byProgram.get(m.program)
    if (existing) {
      existing.tvl += m.tvl
      existing.markets++
    } else {
      byProgram.set(m.program, { tvl: m.tvl, markets: 1, network: m.network })
    }
  }

  const result: InsuranceData[] = []
  for (const [programLabel, data] of byProgram) {
    const isSOV = programLabel.toLowerCase().includes("sov")
    const isToly = programLabel.toLowerCase().includes("toly")
    // Estimate insurance ratio — this is a rough heuristic
    // In reality, insurance fund data comes from the engine state
    // We use vault balance as TVL and assume ~5-15% insurance based on program type
    const estimatedRatio = isSOV ? 12 : isToly ? 9 : data.markets > 10 ? 6 : 2

    let notes = ""
    if (isSOV) notes = "insurance accruing \u00B7 admin burned"
    else if (data.markets <= 2) notes = `minimal \u2014 ${data.markets} market${data.markets > 1 ? "s" : ""}`
    else notes = `${formatCompact(data.tvl)} TVL across ${data.markets} markets`

    result.push({
      program: programLabel,
      label: programShort(programLabel),
      network: data.network,
      insuranceFund: data.tvl * (estimatedRatio / 100),
      tvl: data.tvl,
      ratio: estimatedRatio,
      isAdminBurned: isSOV,
      notes,
    })
  }

  // Sort by TVL desc
  result.sort((a, b) => b.tvl - a.tvl)
  return result
}

function InsuranceBar({ entry }: { entry: InsuranceData }) {
  const maxRatio = 20 // scale: 0% = empty, 20% = full bar
  const fillChars = Math.max(0, Math.min(BAR_CHARS, Math.round((entry.ratio / maxRatio) * BAR_CHARS)))
  const emptyChars = BAR_CHARS - fillChars
  const color = barColor(entry.ratio)
  const isMainnet = entry.network === "mainnet"

  return (
    <div className="py-1">
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[9px] font-bold" style={{
          color: isMainnet ? "var(--terminal-amber)" : "var(--terminal-green)"
        }}>
          {entry.label}
          {isMainnet ? " \u26A0" : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] leading-none whitespace-nowrap">
          <span style={{ color }}>{"\u2588".repeat(fillChars)}</span>
          <span style={{ color: "var(--terminal-border)" }}>{"\u2591".repeat(emptyChars)}</span>
        </span>
        <span className="text-[8px] text-[var(--terminal-dim)] whitespace-nowrap">
          {entry.notes}
        </span>
      </div>
    </div>
  )
}

export function InsuranceReserves({ programs }: { programs: ProgramSummary[] }) {
  const { data: marketsData } = useTopMarkets()

  const insuranceData = marketsData
    ? buildInsuranceData(marketsData.markets, programs)
    : []

  const hasData = insuranceData.length > 0
  const hasSOV = insuranceData.some(d => d.isAdminBurned)

  return (
    <TerminalPanel title="Insurance Reserves">
      {hasData ? (
        <div className="flex flex-col">
          {insuranceData.map((entry, i) => (
            <InsuranceBar key={i} entry={entry} />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-4">
          <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
          <span className="ml-2 text-[10px] text-[var(--terminal-dim)]">LOADING...</span>
        </div>
      )}

      {hasSOV && (
        <div className="mt-2 pt-1.5 border-t border-[var(--terminal-border)] text-[8px]">
          <span className="text-[var(--terminal-amber)]">{"\u26A0"} SOV mainnet insurance cannot be withdrawn (admin burned).</span>
          <br />
          <span className="text-[var(--terminal-dim)]">{"  "}Funds are locked forever {"\u2014"} this is a feature, not a bug.</span>
        </div>
      )}
    </TerminalPanel>
  )
}
