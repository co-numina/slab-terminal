"use client"

import { useMarketData } from "@/hooks/use-market-data"
import { ExplorerLink, truncateAddress } from "./explorer-link"
import { useNavigation, type ViewId } from "@/hooks/use-navigation"

const ASCII_LOGO = `███████╗██╗     ███████╗ ██████╗
██╔════╝██║    ██╔══██╗██╔══██╗
███████╗██║    █████████║██████╔╝
╚════██║██║    ██╔══██║██╔══██╗
███████║███████╗██║  ██║██████╔╝
╚══════╝╚══════╝╚═╝  ╚═╝╚═════╝ `

function formatCrankAge(slotDiff: number): string {
  // Solana slots are ~0.4s each
  const seconds = Math.round(slotDiff * 0.4)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

function crankColor(slotDiff: number): string {
  const seconds = slotDiff * 0.4
  if (seconds < 30) return "var(--terminal-green)"
  if (seconds <= 120) return "var(--terminal-amber)"
  return "var(--terminal-red)"
}

const TABS: { id: ViewId; label: string }[] = [
  { id: "dashboard", label: "DASHBOARD" },
  { id: "radar", label: "RADAR" },
]

export function Header() {
  const { data } = useMarketData()
  const { activeView, setActiveView } = useNavigation()

  const price = data?.oraclePrice ?? 0
  const change = data?.priceChange24h ?? 0
  const isPositive = change >= 0
  const slot = data?.slot ?? 0
  const lastCrankSlot = data?.lastCrankSlot ?? 0
  const crankAgo = slot - lastCrankSlot
  const numSlabs = data?.numSlabs ?? 0
  const primarySlab = data?.slabAddresses?.[0] ?? ""

  return (
    <header className="border-b border-[var(--terminal-border)] bg-[var(--terminal-panel)]">
      <div className="flex flex-col gap-2 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
        {/* Logo + Label — tightened into one unit */}
        <div className="flex items-center gap-3">
          <pre className="hidden text-[7px] leading-[1.15] text-[var(--terminal-green)] md:block md:text-[8px] lg:text-[9px]">
            {ASCII_LOGO}
          </pre>
          <span className="block text-base font-bold text-[var(--terminal-green)] md:hidden">
            $SLAB
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--terminal-dim)]">
              PERCOLATOR ECOSYSTEM INTELLIGENCE
            </span>
            <div className="flex items-center gap-2">
              <span className="border border-[var(--terminal-amber)] px-1 py-px text-[9px] text-[var(--terminal-amber)]">
                DEVNET
              </span>
              <span className="flex items-center gap-1 text-[9px] text-[var(--terminal-green)]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--terminal-green)] animate-pulse-live" />
                LIVE
              </span>
              {primarySlab && (
                <span className="hidden items-center gap-1 text-[9px] text-[var(--terminal-dim)] md:flex">
                  SLAB: <span className="text-[var(--terminal-cyan)]">{truncateAddress(primarySlab)}</span>
                  <ExplorerLink type="address" address={primarySlab} />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Price & Stats */}
        <div className="flex flex-wrap items-center gap-4 lg:gap-6">
          {/* SOL/USD Price — hero element */}
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase text-[var(--terminal-dim)]">
              SOL/USD
            </span>
            <span className="text-2xl font-bold text-[var(--terminal-green)] text-glow-green transition-all duration-300 lg:text-3xl">
              {"$"}{price.toFixed(2)}
            </span>
            <span
              className={`text-sm font-bold ${
                isPositive
                  ? "text-[var(--terminal-green)]"
                  : "text-[var(--terminal-red)]"
              }`}
            >
              {isPositive ? "\u25b2" : "\u25bc"} {isPositive ? "+" : ""}
              {change.toFixed(2)}%
            </span>
          </div>

          {/* Slot */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase text-[var(--terminal-dim)]">
              SLOT
            </span>
            <span className="text-xs text-[var(--terminal-green)]">
              {slot.toLocaleString()}
            </span>
          </div>

          {/* Last Crank — colored number */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase text-[var(--terminal-dim)]">
              LAST CRANK
            </span>
            <span className="text-xs" style={{ color: crankColor(crankAgo) }}>
              {formatCrankAge(crankAgo)}
            </span>
            <span className="text-[10px] text-[var(--terminal-dim)]">ago</span>
          </div>

          {/* Slab count */}
          {numSlabs > 0 && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] uppercase text-[var(--terminal-dim)]">
                SLABS
              </span>
              <span className="text-xs text-[var(--terminal-cyan)]">
                {numSlabs}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tab navigation */}
      <nav className="flex items-center gap-0 border-t border-[var(--terminal-border)] px-3">
        {TABS.map((tab) => {
          const isActive = activeView === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all select-none ${
                isActive
                  ? "text-[var(--terminal-green)] border-b-2 border-[var(--terminal-green)]"
                  : "text-[var(--terminal-dim)] hover:text-[var(--terminal-green)] border-b-2 border-transparent"
              }`}
            >
              {tab.label}
            </button>
          )
        })}
        <span className="flex-1" />
        <span className="text-[9px] text-[var(--terminal-dim)] py-1.5">
          SLAB SCOPE
        </span>
      </nav>
    </header>
  )
}
