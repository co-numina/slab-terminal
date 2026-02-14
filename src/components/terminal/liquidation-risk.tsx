"use client"

import { usePositions } from "@/hooks/use-market-data"
import { TerminalPanel } from "./terminal-panel"

function healthColor(health: number): string {
  if (health < 30) return "var(--terminal-red)"
  if (health < 50) return "var(--terminal-amber)"
  if (health < 70) return "#88cc00"
  return "var(--terminal-green)"
}

function HealthBar({ index, health, slabLabel }: { index: number; health: number; slabLabel?: string }) {
  const totalBars = 25
  const filledBars = Math.round((health / 100) * totalBars)
  const filled = "\u2588".repeat(filledBars)
  const empty = "\u2591".repeat(totalBars - filledBars)
  const color = healthColor(health)
  const isCritical = health < 30

  return (
    <div
      className={`flex items-center gap-2 py-0.5 ${isCritical ? "animate-blink-critical" : ""}`}
    >
      <span className="shrink-0 w-14 text-xs text-[var(--terminal-dim)]">
        IDX {String(index).padStart(3, "0")}
      </span>
      {slabLabel && (
        <span className="shrink-0 w-10 text-[9px] text-[var(--terminal-dim)]">
          {slabLabel}
        </span>
      )}
      <span className="flex-1 text-xs leading-none" style={{ color }}>
        {filled}
        <span className="text-[var(--terminal-dim)]">{empty}</span>
      </span>
      <span className="shrink-0 w-10 text-right text-xs font-bold" style={{ color }}>
        {health}%
      </span>
    </div>
  )
}

export function LiquidationRisk() {
  const { data } = usePositions()
  const positions = data?.positions ?? []

  const atRisk = [...positions]
    .sort((a, b) => a.marginHealth - b.marginHealth)
    .filter((p) => p.marginHealth < 100)

  const belowThreshold = positions.filter((p) => p.marginHealth < 70).length

  // Health stats for empty state
  const minHealth = positions.length > 0
    ? Math.min(...positions.map((p) => p.marginHealth))
    : 0
  const maxHealth = positions.length > 0
    ? Math.max(...positions.map((p) => p.marginHealth))
    : 0
  const allPerfect = positions.length > 0 && minHealth === 100
  const maintenanceMarginPct = 5 // 500 bps = 5%

  return (
    <TerminalPanel title="Liquidation Risk" className="h-full">
      <div className="flex flex-col gap-0.5">
        {atRisk.map((p) => (
          <HealthBar
            key={`${p.slabLabel ?? ""}-${p.accountIndex}`}
            index={p.accountIndex}
            health={p.marginHealth}
            slabLabel={p.slabLabel}
          />
        ))}

        {/* Enhanced empty state when no accounts are at risk */}
        {atRisk.length === 0 && positions.length > 0 && (
          <div className="flex flex-col items-center gap-3 py-4">
            {allPerfect ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--terminal-green)] animate-pulse-live" />
                  <span className="text-xs font-bold text-[var(--terminal-green)]">
                    ALL {positions.length} ACCOUNTS AT 100% HEALTH
                  </span>
                </div>
                <span className="text-[10px] text-[var(--terminal-dim)]">
                  All accounts above maintenance margin ({maintenanceMarginPct}%)
                </span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--terminal-green)] animate-pulse-live" />
                  <span className="text-[10px] text-[var(--terminal-green)]">
                    NO ACCOUNTS AT RISK
                  </span>
                </div>
                <div className="flex gap-4 text-[10px]">
                  <span className="text-[var(--terminal-dim)]">
                    HEALTHIEST: <span className="font-bold text-[var(--terminal-green)]">{maxHealth}%</span>
                  </span>
                  <span className="text-[var(--terminal-dim)]">
                    LOWEST: <span className="font-bold text-[var(--terminal-green)]">{minHealth}%</span>
                  </span>
                </div>
                <span className="text-[10px] text-[var(--terminal-dim)]">
                  All accounts above maintenance margin ({maintenanceMarginPct}%)
                </span>
              </>
            )}
          </div>
        )}

        {/* Loading state */}
        {positions.length === 0 && (
          <div className="flex items-center justify-center py-4">
            <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
            <span className="ml-2 text-[10px] text-[var(--terminal-dim)]">LOADING RISK DATA...</span>
          </div>
        )}

        {belowThreshold > 0 && (
          <div className="mt-2 border-t border-[var(--terminal-border)] pt-2 text-xs">
            <span className="text-[var(--terminal-amber)]">{"\u26a0"}</span>
            {" "}
            <span className="font-bold text-[var(--terminal-green)]">{belowThreshold}</span>
            {" "}
            <span className="text-[var(--terminal-dim)]">
              account{belowThreshold > 1 ? "s" : ""} {"<"} 70% health
            </span>
          </div>
        )}
      </div>
    </TerminalPanel>
  )
}
