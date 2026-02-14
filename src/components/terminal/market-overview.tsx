"use client"

import { useMarketData } from "@/hooks/use-market-data"
import { TerminalPanel } from "./terminal-panel"

function DataRow({
  label,
  value,
  valueColor = "var(--terminal-green)",
  trend,
}: {
  label: string
  value: string
  valueColor?: string
  trend?: "up" | "down"
}) {
  return (
    <div className="flex items-center justify-between py-0.5 pr-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--terminal-dim)]">
        {label}
      </span>
      <span className="flex items-center gap-1 text-xs font-medium" style={{ color: valueColor }}>
        {value}
        {trend === "up" && <span className="text-[9px] text-[var(--terminal-green)]">{"\u25b2"}</span>}
        {trend === "down" && <span className="text-[9px] text-[var(--terminal-red)]">{"\u25bc"}</span>}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="my-0.5 border-t border-[var(--terminal-border)]" />
}

function formatSol(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M SOL`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K SOL`
  return `${value.toFixed(2)} SOL`
}

export function MarketOverview() {
  const { data, isLoading, error } = useMarketData()

  const fundingRate = data?.fundingRate ?? 0
  const fundingColor =
    Math.abs(fundingRate) < 0.001
      ? "var(--terminal-amber)"
      : fundingRate > 0
        ? "var(--terminal-green)"
        : "var(--terminal-red)"

  if (isLoading) {
    return (
      <TerminalPanel title="Market Overview" className="h-full">
        <div className="flex items-center justify-center py-8">
          <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
          <span className="ml-2 text-[10px] text-[var(--terminal-dim)]">LOADING MARKET DATA...</span>
        </div>
      </TerminalPanel>
    )
  }

  return (
    <TerminalPanel title="Market Overview" className="h-full" stale={!!error}>
      <div className="flex flex-col">
        <DataRow
          label="TVL"
          value={formatSol(data?.tvl ?? 0)}
          trend="up"
        />
        <Divider />
        <DataRow
          label="Insurance Fund"
          value={formatSol(data?.insuranceFund ?? 0)}
          trend="up"
        />
        <Divider />
        <DataRow
          label="Open Interest"
          value={`${(data?.openInterest ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} SOL`}
        />
        <Divider />
        <DataRow
          label="Funding Rate"
          value={`${fundingRate >= 0 ? "+" : ""}${(fundingRate * 100).toFixed(4)}%`}
          valueColor={fundingColor}
        />
        <div className="pb-0.5 pr-1 text-right text-[9px] text-[var(--terminal-amber)]">
          {data?.fundingRateDirection === "longs_pay" ? "LONGS PAY SHORTS" : "SHORTS PAY LONGS"}
        </div>
        <Divider />
        <DataRow
          label="Trading Fee"
          value={`${data?.tradingFeeBps ?? 0} bps`}
        />
        <Divider />
        <DataRow
          label="Maint. Margin"
          value={`${(data?.maintenanceMarginBps ?? 0) / 100}%`}
        />
        <Divider />
        <DataRow
          label="Init. Margin"
          value={`${(data?.initialMarginBps ?? 0) / 100}%`}
        />
      </div>
    </TerminalPanel>
  )
}
