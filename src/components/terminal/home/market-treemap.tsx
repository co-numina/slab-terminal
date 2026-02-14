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

function MarketBlock({ market, isHero }: { market: TopMarket; isHero: boolean }) {
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
      <div className="flex items-center gap-2 text-[8px]">
        <span className="text-[var(--terminal-dim)]">{programShort(market.program)}</span>
        <span className="text-[var(--terminal-green)] font-mono">
          {formatCompact(market.tvl)} {market.collateralSymbol}
        </span>
      </div>
      {isHero && (
        <>
          {isMainnet && (
            <div className="text-[8px] text-[var(--terminal-amber)] font-bold">REAL VALUE</div>
          )}
        </>
      )}
    </div>
  )
}

export function MarketTreemap() {
  const { data, isLoading } = useTopMarkets()

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

  // Filter to markets with TVL > 0, sort by TVL desc
  const activeMarkets = [...data.markets]
    .filter(m => m.tvl > 0)
    .sort((a, b) => b.tvl - a.tvl)

  // Count zero-TVL markets
  const zeroTvlCount = data.markets.length - activeMarkets.length

  // Show up to 8 blocks
  const displayMarkets = activeMarkets.slice(0, 8)
  const remainingActive = activeMarkets.length - displayMarkets.length

  if (displayMarkets.length === 0) {
    return (
      <TerminalPanel title="Market Landscape">
        <div className="flex items-center justify-center py-3 text-[10px] text-[var(--terminal-dim)]">
          No markets with TVL &gt; 0
        </div>
      </TerminalPanel>
    )
  }

  // Layout: hero (first) gets full width row, rest split into rows of 4
  const hero = displayMarkets[0]
  const restMarkets = displayMarkets.slice(1)

  // Split rest into rows of 4
  const rows: TopMarket[][] = []
  for (let i = 0; i < restMarkets.length; i += 4) {
    rows.push(restMarkets.slice(i, i + 4))
  }

  const totalRest = remainingActive + zeroTvlCount

  return (
    <TerminalPanel title="Market Landscape">
      <div className="flex flex-col gap-px">
        {/* Row 1: Hero market (full width) */}
        <MarketBlock market={hero} isHero={true} />

        {/* Remaining rows: 4 columns each */}
        {rows.map((row, ri) => (
          <div key={ri} className="grid grid-cols-4 gap-px">
            {row.map((m) => (
              <MarketBlock key={m.slabAddress} market={m} isHero={false} />
            ))}
            {/* Fill last row with rest block if needed */}
            {ri === rows.length - 1 && totalRest > 0 && row.length < 4 && (
              <div
                className="border border-[var(--terminal-border)] px-1.5 py-1 flex flex-col items-center justify-center col-span-1"
                style={{ backgroundColor: "var(--terminal-bg)", gridColumn: `span ${4 - row.length}` }}
              >
                <span className="text-[8px] text-[var(--terminal-dim)]">
                  ~{totalRest} more markets
                </span>
                <span className="text-[7px] text-[var(--terminal-dim)]">
                  ({zeroTvlCount} with 0 TVL)
                </span>
              </div>
            )}
          </div>
        ))}

        {/* If all markets fit but there are still zero-TVL ones */}
        {rows.length > 0 && totalRest > 0 && rows[rows.length - 1].length >= 4 && (
          <div className="border border-[var(--terminal-border)] px-1.5 py-1 flex items-center justify-center"
            style={{ backgroundColor: "var(--terminal-bg)" }}
          >
            <span className="text-[8px] text-[var(--terminal-dim)]">
              ~{totalRest} more markets ({zeroTvlCount} with 0 TVL)
            </span>
          </div>
        )}

        {/* Edge case: no rows but have rest */}
        {rows.length === 0 && totalRest > 0 && (
          <div className="border border-[var(--terminal-border)] px-1.5 py-1 flex items-center justify-center"
            style={{ backgroundColor: "var(--terminal-bg)" }}
          >
            <span className="text-[8px] text-[var(--terminal-dim)]">
              ~{totalRest} more markets ({zeroTvlCount} with 0 TVL)
            </span>
          </div>
        )}
      </div>
    </TerminalPanel>
  )
}
