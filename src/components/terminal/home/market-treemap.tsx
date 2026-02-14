"use client"

import { useTopMarkets, type TopMarket } from "@/hooks/use-top-markets"
import { useNavigation } from "@/hooks/use-navigation"
import { TerminalPanel } from "../terminal-panel"
import { truncateAddress } from "../explorer-link"

function formatCompact(n: number): string {
  if (n === 0) return "0"
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
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

function programBorderColor(label: string, network: string): string {
  if (network === "mainnet") return "var(--terminal-amber)"
  const l = label.toLowerCase()
  if (l.includes("small")) return "var(--terminal-cyan)"
  if (l.includes("toly")) return "var(--terminal-green)"
  return "var(--terminal-dim)"
}

interface TreemapBlock {
  market: TopMarket
  tier: number // 0 = hero, 1 = mid, 2 = small
}

function categorizeTiers(markets: TopMarket[]): { hero: TopMarket | null; mid: TopMarket[]; small: TopMarket[]; rest: number } {
  if (markets.length === 0) return { hero: null, mid: [], small: [], rest: 0 }

  // Sort by TVL desc
  const sorted = [...markets].sort((a, b) => b.tvl - a.tvl)
  const hero = sorted[0]
  const mid = sorted.slice(1, 4) // next 3
  const small = sorted.slice(4, 7) // next 3
  const rest = sorted.length - 7

  return { hero, mid, small, rest: Math.max(0, rest) }
}

function MarketBlock({ market, isBig }: { market: TopMarket; isBig: boolean }) {
  const { navigateToSlab } = useNavigation()
  const borderColor = programBorderColor(market.program, market.network)
  const isMainnet = market.network === "mainnet"
  const hasPositions = market.positions.active > 0

  return (
    <div
      className="border px-1.5 py-1 cursor-pointer hover:bg-[var(--terminal-hover)] transition-colors group"
      style={{
        borderColor,
        backgroundColor: hasPositions ? "rgba(0, 255, 65, 0.02)" : "transparent",
      }}
      onClick={() => navigateToSlab(market.slabAddress, market.program, market.network)}
    >
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-bold text-[var(--terminal-cyan)] group-hover:text-[var(--terminal-green)] transition-colors font-mono">
          {market.collateralSymbol}/{market.config.invert ? "USD" : "USD"}
        </span>
        {isMainnet && <span className="text-[8px] text-[var(--terminal-amber)]">{"\u26A0"}</span>}
      </div>
      <div className="text-[8px] text-[var(--terminal-dim)]">
        {programShort(market.program)}
      </div>
      <div className="text-[9px] font-mono">
        <span className="text-[var(--terminal-green)]">TVL: {formatCompact(market.tvl)}</span>
        {" "}<span className="text-[var(--terminal-dim)]">{market.collateralSymbol}</span>
      </div>
      {isBig && (
        <>
          <div className="text-[8px] text-[var(--terminal-dim)] font-mono mt-0.5">
            {truncateAddress(market.slabAddress, 4)}
          </div>
          {isMainnet && (
            <div className="text-[8px] text-[var(--terminal-amber)] font-bold mt-0.5">REAL VALUE</div>
          )}
        </>
      )}
    </div>
  )
}

export function MarketTreemap() {
  const { data, isLoading } = useTopMarkets()
  const { navigateToSlab } = useNavigation()

  if (isLoading || !data) {
    return (
      <TerminalPanel title="Market Landscape">
        <div className="flex items-center justify-center py-3">
          <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
          <span className="ml-2 text-[9px] text-[var(--terminal-dim)]">MAPPING MARKETS...</span>
        </div>
      </TerminalPanel>
    )
  }

  // Filter to only markets with TVL > 0
  const activeMarkets = data.markets.filter(m => m.tvl > 0)
  const { hero, mid, small, rest } = categorizeTiers(activeMarkets)

  if (!hero) {
    return (
      <TerminalPanel title="Market Landscape">
        <div className="flex items-center justify-center py-4 text-[10px] text-[var(--terminal-dim)]">
          No market data available
        </div>
      </TerminalPanel>
    )
  }

  return (
    <TerminalPanel title="Market Landscape">
      <div className="flex flex-col gap-px">
        {/* Row 1: Hero market (full width) */}
        <MarketBlock market={hero} isBig={true} />

        {/* Row 2: Mid-tier markets (3 columns) */}
        {mid.length > 0 && (
          <div className="grid grid-cols-3 gap-px">
            {mid.map((m) => (
              <MarketBlock key={m.slabAddress} market={m} isBig={false} />
            ))}
          </div>
        )}

        {/* Row 3: Small markets + rest */}
        {(small.length > 0 || rest > 0) && (
          <div className="grid grid-cols-3 gap-px">
            {small.map((m) => (
              <MarketBlock key={m.slabAddress} market={m} isBig={false} />
            ))}
            {rest > 0 && (
              <div
                className="border border-[var(--terminal-border)] px-1.5 py-1 flex flex-col items-center justify-center"
                style={{ backgroundColor: "var(--terminal-bg)" }}
              >
                <span className="text-[8px] text-[var(--terminal-dim)]">{rest}+ more</span>
                <span className="font-mono text-[9px] text-[var(--terminal-border)]">
                  {"\u2591".repeat(8)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

    </TerminalPanel>
  )
}
