"use client"

import { useEcosystem } from "@/hooks/use-ecosystem"
import { useNavigation, type ViewId } from "@/hooks/use-navigation"

const ASCII_LOGO = ` \u2584\u2584\u2584\u2584\u2584\u2584\u2584 \u2584\u2584\u2584        \u2584\u2584\u2584\u2584   \u2584\u2584\u2584\u2584\u2584\u2584\u2584
\u2588\u2588\u2588\u2588\u2588\u2580\u2580\u2580 \u2588\u2588\u2588      \u2584\u2588\u2588\u2580\u2580\u2588\u2588\u2584 \u2588\u2588\u2588\u2580\u2580\u2588\u2588\u2588\u2584
 \u2580\u2588\u2588\u2588\u2588\u2584  \u2588\u2588\u2588      \u2588\u2588\u2588  \u2588\u2588\u2588 \u2588\u2588\u2588\u2584\u2584\u2588\u2588\u2588\u2580
   \u2580\u2588\u2588\u2588\u2588 \u2588\u2588\u2588      \u2588\u2588\u2588\u2580\u2580\u2588\u2588\u2588 \u2588\u2588\u2588  \u2588\u2588\u2588\u2584
\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2580 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588 \u2588\u2588\u2588  \u2588\u2588\u2588 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2580`

const TABS: { id: ViewId; label: string }[] = [
  { id: "home", label: "HOME" },
  { id: "radar", label: "RADAR" },
  { id: "docs", label: "DOCS" },
]

export function Header() {
  const { data } = useEcosystem()
  const { activeView, setActiveView } = useNavigation()

  const totalPrograms = data?.programs.total ?? 0
  const totalSlabs = data?.slabs.total ?? 0
  const totalAccounts = data?.accounts.total ?? 0
  const activePrograms = data?.programs.active ?? 0
  const hasMainnet = (data?.networks.mainnet.programs ?? 0) > 0
  const solPrice = data?.solUsdPrice ?? 0

  return (
    <header className="border-b border-[var(--terminal-border)] bg-[var(--terminal-panel)]">
      <div className="flex flex-col gap-2 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
        {/* Logo + Label */}
        <div className="flex items-center gap-3">
          <pre
            className="hidden text-[var(--terminal-green)] md:block"
            style={{ fontSize: '11px', lineHeight: '11px', fontFamily: '"Courier New", monospace' }}
          >
            {ASCII_LOGO}
          </pre>
          <span className="block text-base font-bold text-[var(--terminal-green)] md:hidden">
            $SLAB
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--terminal-dim)]">
              PERCOLATOR ECOSYSTEM EXPLORER
            </span>
            <div className="flex items-center gap-2">
              <span className="border border-[var(--terminal-amber)] px-1 py-px text-[9px] text-[var(--terminal-amber)]">
                DEVNET
              </span>
              {hasMainnet && (
                <span className="border border-[var(--terminal-green)] px-1 py-px text-[9px] text-[var(--terminal-green)]">
                  MAINNET
                </span>
              )}
              <span className="flex items-center gap-1 text-[9px] text-[var(--terminal-green)]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--terminal-green)] animate-pulse-live" />
                LIVE
              </span>
            </div>
          </div>
        </div>

        {/* Ecosystem Stats */}
        <div className="flex flex-wrap items-center gap-4 lg:gap-6">
          {solPrice > 0 && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] uppercase text-[var(--terminal-dim)]">SOL</span>
              <span className="text-xs font-bold text-[var(--terminal-amber)]">${solPrice.toFixed(2)}</span>
            </div>
          )}

          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase text-[var(--terminal-dim)]">PROGRAMS</span>
            <span className="text-xs font-bold text-[var(--terminal-green)]">{totalPrograms}</span>
            {activePrograms > 0 && (
              <span className="text-[9px] text-[var(--terminal-dim)]">({activePrograms} active)</span>
            )}
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase text-[var(--terminal-dim)]">SLABS</span>
            <span className="text-xs font-bold text-[var(--terminal-cyan)]">{totalSlabs}</span>
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase text-[var(--terminal-dim)]">ACCOUNTS</span>
            <span className="text-xs font-bold text-[var(--terminal-cyan)]">{totalAccounts.toLocaleString()}</span>
          </div>

          {data?.scanDurationMs != null && (
            <div className="hidden items-baseline gap-1.5 md:flex">
              <span className="text-[10px] uppercase text-[var(--terminal-dim)]">SCAN</span>
              <span className="text-[10px] text-[var(--terminal-dim)]">{data.scanDurationMs}ms</span>
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
        {activeView === "slab" && (
          <span className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--terminal-cyan)] border-b-2 border-[var(--terminal-cyan)]">
            SLAB DETAIL
          </span>
        )}
        <span className="flex-1" />
        <span className="text-[9px] text-[var(--terminal-dim)] py-1.5">
          SLAB SCOPE v1.0
        </span>
      </nav>
    </header>
  )
}
