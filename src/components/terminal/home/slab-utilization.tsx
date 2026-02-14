"use client"

import { TerminalPanel } from "../terminal-panel"
import { useNavigation } from "@/hooks/use-navigation"
import type { ProgramSummary } from "@/hooks/use-ecosystem"
import { useTopMarkets, type TopMarket } from "@/hooks/use-top-markets"

interface SlabBlock {
  address: string
  program: string
  network: "devnet" | "mainnet"
  used: number
  max: number
  utilization: number
}

function utilizationChar(pct: number): string {
  if (pct === 0) return "\u25AA"   // ▪ empty/dead
  if (pct < 10) return "\u2591"    // ░ low
  if (pct < 50) return "\u2592"    // ▒ medium
  if (pct < 90) return "\u2593"    // ▓ high
  return "\u2588"                   // █ maxed out
}

function utilizationColor(pct: number): string {
  if (pct === 0) return "#333333"
  if (pct < 50) return "#00ff4177"
  if (pct < 90) return "#ffd700"
  if (pct >= 100) return "#ff4444"
  return "#00ff41"
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
 * Build slab blocks grouped by program from top-markets data.
 */
function buildBlocks(markets: TopMarket[]): Map<string, SlabBlock[]> {
  const groups = new Map<string, SlabBlock[]>()

  for (const m of markets) {
    const programKey = m.program
    if (!groups.has(programKey)) groups.set(programKey, [])

    groups.get(programKey)!.push({
      address: m.slabAddress,
      program: m.program,
      network: m.network,
      used: m.config.usedAccounts,
      max: m.config.maxAccounts,
      utilization: m.config.utilization,
    })
  }

  return groups
}

function ProgramRow({ label, blocks, network, summary, programId }: {
  label: string
  blocks: SlabBlock[]
  network: "devnet" | "mainnet"
  summary: ProgramSummary | undefined
  programId: string
}) {
  const { navigateToSlab } = useNavigation()
  const totalSlabs = summary?.slabCount ?? blocks.length
  const totalAccounts = summary?.accountCount ?? blocks.reduce((s, b) => s + b.used, 0)
  const activeSlabs = summary?.activeSlabCount ?? blocks.filter(b => b.used > 0).length
  const isMainnet = network === "mainnet"

  return (
    <div className="py-0.5">
      <div className="flex items-center gap-1.5 mb-px">
        <span className="text-[8px] font-bold" style={{
          color: isMainnet ? "var(--terminal-amber)" : "var(--terminal-green)"
        }}>
          {programShort(label)}
          {isMainnet ? " \u26A0" : ""}
        </span>
        <span className="text-[7px] text-[var(--terminal-dim)]">
          ({totalSlabs})
        </span>
      </div>
      <div className="flex items-center gap-0">
        <span className="font-mono text-[11px] leading-none whitespace-nowrap" style={{ letterSpacing: "1px" }}>
          {blocks.map((block, i) => {
            const pct = block.max > 0 ? (block.used / block.max) * 100 : 0
            return (
              <span
                key={i}
                style={{ color: utilizationColor(pct), cursor: "pointer" }}
                title={`${block.address.slice(0, 8)}... ${block.used}/${block.max} accts (${pct.toFixed(0)}%)`}
                onClick={() => navigateToSlab(block.address, label, network, programId)}
              >
                {utilizationChar(pct)}
              </span>
            )
          })}
        </span>
        <span className="ml-1.5 text-[7px] text-[var(--terminal-dim)] whitespace-nowrap">
          {activeSlabs}/{totalSlabs} active, {totalAccounts.toLocaleString()} accts
        </span>
      </div>
    </div>
  )
}

export function SlabUtilization({ programs }: { programs: ProgramSummary[] }) {
  const { data: marketsData } = useTopMarkets()

  const blocks = marketsData ? buildBlocks(marketsData.markets) : new Map()

  // Sort programs: most slabs first
  const sortedPrograms = [...programs].sort((a, b) => b.slabCount - a.slabCount)

  return (
    <TerminalPanel title="Slab Utilization">
      <div className="flex flex-col">
        {sortedPrograms.map((p) => {
          const programBlocks = blocks.get(p.label) ?? []
          // If we have market data blocks, use those; otherwise show empty representation
          const displayBlocks = programBlocks.length > 0
            ? programBlocks
            : Array.from({ length: Math.min(p.slabCount, 50) }, (_, i) => ({
                address: `unknown-${i}`,
                program: p.label,
                network: p.network,
                used: 0,
                max: 1,
                utilization: 0,
              }))

          return (
            <ProgramRow
              key={p.id}
              label={p.label}
              blocks={displayBlocks}
              network={p.network}
              summary={p}
              programId={p.programId}
            />
          )
        })}
      </div>
      <div className="flex items-center gap-2 mt-1 pt-1 border-t border-[var(--terminal-border)] text-[7px] text-[var(--terminal-dim)]">
        <span><span style={{ color: "#333333" }}>{"\u25AA"}</span>0%</span>
        <span><span style={{ color: "#00ff4177" }}>{"\u2591"}</span>&lt;10</span>
        <span><span style={{ color: "#00ff4177" }}>{"\u2592"}</span>10-50</span>
        <span><span style={{ color: "#ffd700" }}>{"\u2593"}</span>50-90</span>
        <span><span style={{ color: "#00ff41" }}>{"\u2588"}</span>90+</span>
        <span><span style={{ color: "#ff4444" }}>{"\u2588"}</span>over</span>
      </div>
    </TerminalPanel>
  )
}
