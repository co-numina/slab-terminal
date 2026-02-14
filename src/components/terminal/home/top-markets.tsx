"use client"

import { useState } from "react"
import { useTopMarkets, type TopMarket } from "@/hooks/use-top-markets"
import { useNavigation } from "@/hooks/use-navigation"
import { TerminalPanel } from "../terminal-panel"
import { truncateAddress } from "../explorer-link"

type SortKey = "tvl" | "positions" | "health" | "oi"

function formatCompact(n: number): string {
  if (n === 0) return "0"
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
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
  if (name.toLowerCase().includes("toly")) return "toly"
  if (name.toLowerCase().includes("small")) return "launch-s"
  if (name.toLowerCase().includes("medium")) return "launch-m"
  if (name.toLowerCase().includes("large")) return "launch-l"
  if (name.toLowerCase().includes("sov")) return "SOV"
  return name.slice(0, 8)
}

function sortMarkets(markets: TopMarket[], key: SortKey): TopMarket[] {
  const sorted = [...markets]
  switch (key) {
    case "tvl": return sorted.sort((a, b) => b.tvl - a.tvl)
    case "positions": return sorted.sort((a, b) => b.positions.active - a.positions.active)
    case "health": return sorted.sort((a, b) => a.worstHealth - b.worstHealth)
    case "oi": return sorted.sort((a, b) => b.openInterest - a.openInterest)
  }
}

function MarketRow({ market, rank }: { market: TopMarket; rank: number }) {
  const { navigateToSlab } = useNavigation()
  const h = healthBar(market.worstHealth)
  const posStr = market.positions.active > 0
    ? `${market.positions.longs}L/${market.positions.shorts}S`
    : "-"

  return (
    <tr
      className="border-b border-dotted border-[var(--terminal-border)] hover:bg-[var(--terminal-hover)] transition-colors cursor-pointer group"
      onClick={() => navigateToSlab(market.slabAddress, market.program, market.network)}
    >
      <td className="py-0.5 pr-1.5 text-[var(--terminal-dim)]">{rank}</td>
      <td className="py-0.5 pr-1.5">
        <div className="flex items-center gap-1">
          <span className="text-[var(--terminal-cyan)] font-mono group-hover:text-[var(--terminal-green)] transition-colors">
            {market.collateralSymbol}/{market.config.invert ? "USD" : "USD"}
          </span>
          {market.network === "mainnet" && (
            <span className="text-[8px] text-[var(--terminal-amber)]" title="Mainnet - real value">{"⚠"}</span>
          )}
        </div>
      </td>
      <td className="py-0.5 pr-1.5 text-[9px]">
        <span className="text-[var(--terminal-dim)]">{programShort(market.program)}</span>
      </td>
      <td className="py-0.5 pr-1.5 text-right font-mono">{formatPrice(market.price)}</td>
      <td className="py-0.5 pr-1.5 text-right font-mono text-[var(--terminal-green)]">
        {formatCompact(market.tvl)} {market.collateralSymbol}
      </td>
      <td className="py-0.5 pr-1.5 text-right font-mono text-[var(--terminal-dim)]">
        {market.openInterest > 0 ? formatCompact(market.openInterest) : "-"}
      </td>
      <td className="py-0.5 pr-1.5 text-right">
        <span className={market.positions.active > 0 ? "" : "text-[var(--terminal-dim)]"}>
          {posStr}
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
        {(["tvl", "positions", "health", "oi"] as SortKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`px-1 py-px uppercase tracking-wider border transition-all select-none ${
              sortKey === key
                ? "border-[var(--terminal-green)] text-[var(--terminal-green)]"
                : "border-[var(--terminal-border)] text-[var(--terminal-dim)] hover:text-[var(--terminal-green)]"
            }`}
          >
            {key === "oi" ? "OI" : key === "positions" ? "POS" : key.toUpperCase()}
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
          Showing {data.count} of {data.totalCandidates}
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
