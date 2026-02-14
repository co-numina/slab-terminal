"use client"

import { useState } from "react"
import { useTopMarkets, type TopMarket, type OracleMode } from "@/hooks/use-top-markets"
import { useNavigation } from "@/hooks/use-navigation"
import { TerminalPanel } from "../terminal-panel"

type SortKey = "tvl" | "positions" | "health" | "oi" | "insurance"

function formatCompact(n: number): string {
  if (n === 0) return "0"
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

function formatUsd(n: number): string {
  if (n === 0) return "-"
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  if (n >= 1) return `$${n.toFixed(0)}`
  if (n >= 0.01) return `$${n.toFixed(2)}`
  return `$${n.toExponential(1)}`
}

function formatPrice(price: number): string {
  if (price === 0) return "-"
  if (price >= 1000) return `$${price.toFixed(0)}`
  if (price >= 1) return `$${price.toFixed(2)}`
  if (price >= 0.01) return `$${price.toFixed(4)}`
  return `$${price.toExponential(1)}`
}

function healthBar(health: number): { color: string; label: string } {
  if (health >= 80) return { color: "var(--terminal-green)", label: `${health}%` }
  if (health >= 40) return { color: "var(--terminal-amber)", label: `${health}%` }
  return { color: "var(--terminal-red)", label: `${health}%` }
}

function programShort(name: string): string {
  // Labels are already short — just return as-is
  // "Toly OG", "Launch 240", "Launch 960", "Launch 4096", "SOV"
  return name
}

function oracleBadge(mode: OracleMode): { label: string; color: string } {
  switch (mode) {
    case "admin": return { label: "ADMIN", color: "var(--terminal-amber)" }
    case "pyth": return { label: "PYTH", color: "var(--terminal-green)" }
    case "dex-pumpswap": return { label: "PUMP", color: "var(--terminal-cyan)" }
    case "dex-raydium": return { label: "RAY", color: "#7C3AED" }
    case "dex-meteora": return { label: "MET", color: "#06B6D4" }
    default: return { label: "?", color: "var(--terminal-dim)" }
  }
}

function insuranceIndicator(health: "healthy" | "caution" | "warning"): { char: string; color: string } {
  switch (health) {
    case "healthy": return { char: "\u25CF", color: "var(--terminal-green)" }
    case "caution": return { char: "\u25CF", color: "var(--terminal-amber)" }
    case "warning": return { char: "\u25CF", color: "var(--terminal-red)" }
  }
}

function sortMarkets(markets: TopMarket[], key: SortKey): TopMarket[] {
  const sorted = [...markets]
  switch (key) {
    case "tvl": return sorted.sort((a, b) => {
      const aVal = a.tvlUsd > 0 ? a.tvlUsd : a.tvl
      const bVal = b.tvlUsd > 0 ? b.tvlUsd : b.tvl
      return bVal - aVal
    })
    case "positions": return sorted.sort((a, b) => b.positions.active - a.positions.active)
    case "health": return sorted.sort((a, b) => a.worstHealth - b.worstHealth)
    case "oi": return sorted.sort((a, b) => {
      const aVal = a.openInterestUsd > 0 ? a.openInterestUsd : a.openInterest
      const bVal = b.openInterestUsd > 0 ? b.openInterestUsd : b.openInterest
      return bVal - aVal
    })
    case "insurance": return sorted.sort((a, b) => a.insurance.ratio - b.insurance.ratio)
  }
}

function MarketRow({ market, rank }: { market: TopMarket; rank: number }) {
  const { navigateToSlab } = useNavigation()
  const h = healthBar(market.worstHealth)
  const oracle = oracleBadge(market.oracleMode)
  const ins = insuranceIndicator(market.insurance.health)
  const posStr = market.positions.active > 0
    ? `${market.positions.longs}L/${market.positions.shorts}S`
    : "-"

  // Use USD values when available, fall back to raw token amounts
  const tvlDisplay = market.tvlUsd > 0
    ? formatUsd(market.tvlUsd)
    : `${formatCompact(market.tvl)} ${market.collateralSymbol}`
  const oiDisplay = market.openInterestUsd > 0
    ? formatUsd(market.openInterestUsd)
    : market.openInterest > 0
      ? formatCompact(market.openInterest)
      : "-"

  return (
    <tr
      className="border-b border-dotted border-[var(--terminal-border)] hover:bg-[var(--terminal-hover)] transition-colors cursor-pointer group"
      onClick={() => navigateToSlab(market.slabAddress, market.program, market.network, market.programId)}
    >
      <td className="py-0.5 pr-1.5 text-[var(--terminal-dim)]">{rank}</td>
      <td className="py-0.5 pr-1.5">
        <div className="flex items-center gap-1">
          <span className="text-[var(--terminal-cyan)] font-mono group-hover:text-[var(--terminal-green)] transition-colors">
            {market.collateralSymbol}/{market.config.invert ? "USD" : "USD"}
          </span>
          <span
            className="text-[7px] font-mono px-0.5 border"
            style={{ color: oracle.color, borderColor: oracle.color }}
            title={`Oracle: ${market.oracleMode}`}
          >
            {oracle.label}
          </span>
          {market.network === "mainnet" && (
            <span className="text-[8px] text-[var(--terminal-amber)]" title="Mainnet - real value">{"\u26A0"}</span>
          )}
        </div>
      </td>
      <td className="py-0.5 pr-1.5 text-[9px]">
        <span className="text-[var(--terminal-dim)]">{programShort(market.program)}</span>
      </td>
      <td className="py-0.5 pr-1.5 text-right font-mono">
        {market.priceUsd > 0 ? formatPrice(market.priceUsd) : formatPrice(market.price)}
      </td>
      <td className="py-0.5 pr-1.5 text-right font-mono text-[var(--terminal-green)]">
        {tvlDisplay}
      </td>
      <td className="py-0.5 pr-1.5 text-right font-mono text-[var(--terminal-dim)]">
        {oiDisplay}
      </td>
      <td className="py-0.5 pr-1.5 text-right">
        <span className={market.positions.active > 0 ? "" : "text-[var(--terminal-dim)]"}>
          {posStr}
        </span>
      </td>
      <td className="py-0.5 pr-1.5 text-right">
        <span style={{ color: ins.color }} title={`Insurance: ${(market.insurance.ratio * 100).toFixed(1)}% ratio`}>
          {ins.char}
        </span>
      </td>
      <td className="py-0.5 text-right">
        <div className="flex items-center gap-1 justify-end">
          <div className="w-8 h-1.5 bg-[var(--terminal-bg)] border border-[var(--terminal-border)]">
            <div
              className="h-full"
              style={{ width: `${Math.min(100, market.worstHealth)}%`, backgroundColor: h.color }}
            />
          </div>
          <span className="text-[9px] font-mono w-7 text-right" style={{ color: h.color }}>
            {h.label}
          </span>
        </div>
      </td>
    </tr>
  )
}

export function TopMarkets() {
  const { data, isLoading } = useTopMarkets()
  const { setActiveView } = useNavigation()
  const [sortKey, setSortKey] = useState<SortKey>("tvl")

  if (isLoading || !data) {
    return (
      <TerminalPanel title="Top Markets">
        <div className="flex items-center justify-center py-3">
          <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
          <span className="ml-2 text-[9px] text-[var(--terminal-dim)]">PARSING TOP MARKETS...</span>
        </div>
      </TerminalPanel>
    )
  }

  const sorted = sortMarkets(data.markets, sortKey)

  return (
    <TerminalPanel title={`Top Markets (${data.count} of ${data.totalCandidates})`}>
      {/* Sort bar */}
      <div className="flex items-center gap-1.5 pb-1 border-b border-[var(--terminal-border)] text-[8px]">
        <span className="text-[var(--terminal-dim)]">SORT:</span>
        {(["tvl", "positions", "health", "oi", "insurance"] as SortKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`px-1 py-px uppercase tracking-wider border transition-all select-none ${
              sortKey === key
                ? "border-[var(--terminal-green)] text-[var(--terminal-green)]"
                : "border-[var(--terminal-border)] text-[var(--terminal-dim)] hover:text-[var(--terminal-green)]"
            }`}
          >
            {key === "oi" ? "OI" : key === "positions" ? "POS" : key === "insurance" ? "INS" : key.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="max-h-[320px] overflow-y-auto mt-0.5">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-[var(--terminal-dim)] text-left uppercase">
              <th className="pb-0.5 pr-1.5">#</th>
              <th className="pb-0.5 pr-1.5">MARKET</th>
              <th className="pb-0.5 pr-1.5">PROGRAM</th>
              <th className="pb-0.5 pr-1.5 text-right">PRICE</th>
              <th className="pb-0.5 pr-1.5 text-right">TVL</th>
              <th className="pb-0.5 pr-1.5 text-right">OI</th>
              <th className="pb-0.5 pr-1.5 text-right">POS</th>
              <th className="pb-0.5 pr-1.5 text-right">INS</th>
              <th className="pb-0.5 text-right">HEALTH</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((market, i) => (
              <MarketRow key={market.slabAddress} market={market} rank={i + 1} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-1 flex items-center justify-between text-[8px]">
        <span className="text-[var(--terminal-dim)]">
          Showing {data.count} of {data.totalCandidates} | Prices via DexScreener
        </span>
        <button
          onClick={() => setActiveView("radar")}
          className="text-[var(--terminal-cyan)] hover:text-[var(--terminal-green)] transition-colors cursor-pointer"
        >
          View all in RADAR {"\u2192"}
        </button>
      </div>
    </TerminalPanel>
  )
}
