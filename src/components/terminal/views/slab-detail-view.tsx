"use client"

import { useState } from "react"
import { useNavigation } from "@/hooks/use-navigation"
import { useSlabDetail, type SlabDetail, type SlabPosition, type SlabLP } from "@/hooks/use-slab-detail"
import { TerminalPanel } from "../terminal-panel"
import { ExplorerLink, truncateAddress } from "../explorer-link"

// ── Helpers ──────────────────────────────────────────────────────────────

function formatSol(n: number, decimals = 4): string {
  if (Math.abs(n) < 0.0001) return "0"
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals })
}

function formatUsd(n: number): string {
  if (n === 0) return "$0"
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`
}

function formatSlabSize(bytes: number): string {
  if (bytes >= 900000) return "992KB (~4096 accounts)"
  if (bytes >= 200000) return "249KB (~960 accounts)"
  return "62KB (~240 accounts)"
}

function statusColor(status: string): string {
  switch (status) {
    case "safe": return "var(--terminal-green)"
    case "at_risk": return "var(--terminal-amber)"
    case "liquidatable": return "var(--terminal-red)"
    default: return "var(--terminal-dim)"
  }
}

function sideColor(side: string): string {
  switch (side) {
    case "long": return "var(--terminal-green)"
    case "short": return "var(--terminal-red)"
    default: return "var(--terminal-dim)"
  }
}

// ── Back Button ──────────────────────────────────────────────────────────

function BackButton() {
  const { goBack, previousView } = useNavigation()
  const label = previousView === "radar" ? "RADAR" : "DASHBOARD"
  return (
    <button
      onClick={goBack}
      className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-[var(--terminal-amber)] hover:text-[var(--terminal-green)] border border-[var(--terminal-border)] hover:border-[var(--terminal-green)] transition-all select-none"
    >
      <span>{"◀"}</span>
      <span>BACK TO {label}</span>
    </button>
  )
}

// ── Stat Cell ────────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase text-[var(--terminal-dim)]">{label}</span>
      <span className="text-xs font-bold" style={{ color: color ?? "var(--terminal-green)" }}>
        {value}
      </span>
    </div>
  )
}

// ── Market Overview Panel ────────────────────────────────────────────────

function MarketOverviewPanel({ data }: { data: SlabDetail }) {
  const crankAgeSec = data.slot > 0 ? (data.slot - data.engine.lastCrankSlot) * 0.4 : 0
  const crankAgeStr =
    crankAgeSec < 60 ? `${Math.round(crankAgeSec)}s` :
    crankAgeSec < 3600 ? `${Math.floor(crankAgeSec / 60)}m` :
    `${Math.floor(crankAgeSec / 3600)}h ${Math.floor((crankAgeSec % 3600) / 60)}m`

  const crankColor =
    crankAgeSec < 30 ? "var(--terminal-green)" :
    crankAgeSec < 120 ? "var(--terminal-amber)" :
    "var(--terminal-red)"

  return (
    <TerminalPanel title="Market State">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="SOL/USD" value={data.solUsdPrice > 0 ? `$${data.solUsdPrice.toFixed(2)}` : "N/A"} />
        <Stat label="TVL" value={`${formatSol(data.vaultBalanceSol)} SOL`} />
        <Stat label="TVL (USD)" value={formatUsd(data.tvlUsd)} />
        <Stat label="Open Interest" value={`${formatSol(data.openInterestSol)} SOL`} />
        <Stat label="Insurance Fund" value={`${formatSol(data.insuranceFundSol)} SOL`} />
        <Stat
          label="Funding Rate (1h)"
          value={`${data.fundingRate.rateBpsPerHour >= 0 ? "+" : ""}${data.fundingRate.rateBpsPerHour.toFixed(4)} bps`}
          color={
            data.fundingRate.direction === "longs_pay" ? "var(--terminal-red)" :
            data.fundingRate.direction === "shorts_pay" ? "var(--terminal-green)" :
            "var(--terminal-dim)"
          }
        />
        <Stat
          label="Last Crank"
          value={`${crankAgeStr} ago`}
          color={crankColor}
        />
        <Stat label="Slot" value={data.slot.toLocaleString()} color="var(--terminal-cyan)" />
      </div>
    </TerminalPanel>
  )
}

// ── Config Panel ─────────────────────────────────────────────────────────

function ConfigPanel({ data }: { data: SlabDetail }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <TerminalPanel title="Slab Config">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Slab Size" value={formatSlabSize(data.slabSize)} color="var(--terminal-cyan)" />
        <Stat label="Max Accounts" value={`${data.maxAccountCapacity}`} color="var(--terminal-cyan)" />
        <Stat label="Used Accounts" value={`${data.engine.numUsedAccounts}`} />
        <Stat
          label="Utilization"
          value={data.maxAccountCapacity > 0 ? `${((data.engine.numUsedAccounts / data.maxAccountCapacity) * 100).toFixed(1)}%` : "N/A"}
        />
        <Stat label="Maint. Margin" value={formatBps(data.params.maintenanceMarginBps)} color="var(--terminal-amber)" />
        <Stat label="Init. Margin" value={formatBps(data.params.initialMarginBps)} color="var(--terminal-amber)" />
        <Stat label="Trading Fee" value={formatBps(data.params.tradingFeeBps)} />
        <Stat label="Liq. Fee" value={formatBps(data.params.liquidationFeeBps)} color="var(--terminal-red)" />
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 mt-2 pt-2 border-t border-[var(--terminal-border)] text-[10px] text-[var(--terminal-dim)] hover:text-[var(--terminal-amber)] transition-colors select-none"
      >
        <span className="text-[var(--terminal-amber)]">{expanded ? "▼" : "▶"}</span>
        <span className="uppercase tracking-wider">RAW CONFIG</span>
        <span className="flex-1 border-t border-dashed border-[var(--terminal-border)]" />
        <span className="text-[9px]">{expanded ? "COLLAPSE" : "EXPAND"}</span>
      </button>

      {expanded && (
        <div className="mt-2 grid grid-cols-1 gap-1 text-[10px] font-mono">
          <ConfigRow label="Collateral Mint" value={data.config.collateralMint} address network={data.network} />
          <ConfigRow label="Vault" value={data.config.vaultPubkey} address network={data.network} />
          <ConfigRow label="Oracle Feed" value={data.config.indexFeedId} address network={data.network} />
          <ConfigRow label="Oracle Authority" value={data.config.oracleAuthority} address network={data.network} />
          <ConfigRow label="Admin" value={data.header.admin} address network={data.network} />
          <ConfigRow label="Inverted" value={data.config.invert === 1 ? "Yes" : "No"} />
          <ConfigRow label="Unit Scale" value={data.config.unitScale.toString()} />
          <ConfigRow label="Version" value={`v${data.header.version}`} />
          <ConfigRow label="Resolved" value={data.header.resolved ? "Yes" : "No"} />
          <ConfigRow label="Last Eff. Price E6" value={data.config.lastEffectivePriceE6} />
          <ConfigRow label="Lifetime Liquidations" value={data.engine.lifetimeLiquidations.toString()} />
          <ConfigRow label="Lifetime Force-Closes" value={data.engine.lifetimeForceCloses.toString()} />
        </div>
      )}
    </TerminalPanel>
  )
}

function ConfigRow({
  label,
  value,
  address,
  network,
}: {
  label: string
  value: string
  address?: boolean
  network?: "devnet" | "mainnet"
}) {
  return (
    <div className="flex items-center justify-between py-0.5 border-b border-dotted border-[var(--terminal-border)]">
      <span className="text-[var(--terminal-dim)]">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--terminal-cyan)]">
          {address ? truncateAddress(value, 6) : value}
        </span>
        {address && network && (
          <ExplorerLink type="address" address={value} network={network} />
        )}
      </div>
    </div>
  )
}

// ── Positions Table ──────────────────────────────────────────────────────

function PositionsPanel({ data }: { data: SlabDetail }) {
  const [showLPs, setShowLPs] = useState(true)
  const positions = showLPs
    ? data.positions
    : data.positions.filter((p) => !p.isLP)

  return (
    <TerminalPanel title={`Positions (${data.summary.totalPositions})`}>
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] pb-2 border-b border-[var(--terminal-border)]">
        <span className="text-[var(--terminal-dim)]">
          LONGS: <span className="font-bold text-[var(--terminal-green)]">{data.summary.totalLongs}</span>
        </span>
        <span className="text-[var(--terminal-dim)]">
          SHORTS: <span className="font-bold text-[var(--terminal-red)]">{data.summary.totalShorts}</span>
        </span>
        <span className="text-[var(--terminal-dim)]">
          LPS: <span className="font-bold text-[var(--terminal-cyan)]">{data.summary.totalLPs}</span>
        </span>
        {data.summary.liquidatable > 0 && (
          <span className="text-[var(--terminal-red)] font-bold">
            {data.summary.liquidatable} LIQUIDATABLE
          </span>
        )}
        {data.summary.atRisk > 0 && (
          <span className="text-[var(--terminal-amber)] font-bold">
            {data.summary.atRisk} AT RISK
          </span>
        )}
        <button
          onClick={() => setShowLPs(!showLPs)}
          className="ml-auto text-[9px] text-[var(--terminal-dim)] hover:text-[var(--terminal-amber)] transition-colors select-none"
        >
          {showLPs ? "HIDE LPS" : "SHOW LPS"}
        </button>
      </div>

      {/* Table */}
      {positions.length === 0 ? (
        <div className="py-4 text-center text-[10px] text-[var(--terminal-dim)]">
          NO ACTIVE POSITIONS
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto mt-1">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[var(--terminal-dim)] text-left uppercase">
                <th className="pb-1 pr-2">IDX</th>
                <th className="pb-1 pr-2">SIDE</th>
                <th className="pb-1 pr-2">OWNER</th>
                <th className="pb-1 pr-2 text-right">SIZE (SOL)</th>
                <th className="pb-1 pr-2 text-right">ENTRY</th>
                <th className="pb-1 pr-2 text-right">PNL</th>
                <th className="pb-1 pr-2 text-right">HEALTH</th>
                <th className="pb-1 text-right">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <PositionRow key={`${pos.accountIndex}`} pos={pos} network={data.network} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TerminalPanel>
  )
}

function PositionRow({ pos, network }: { pos: SlabPosition; network: "devnet" | "mainnet" }) {
  const sideStr = pos.isLP ? "LP" : pos.side.toUpperCase()
  const sColor = pos.isLP ? "var(--terminal-cyan)" : sideColor(pos.side)

  return (
    <tr className="border-b border-dotted border-[var(--terminal-border)] hover:bg-[var(--terminal-hover)] transition-colors">
      <td className="py-0.5 pr-2 text-[var(--terminal-dim)]">{pos.accountIndex}</td>
      <td className="py-0.5 pr-2 font-bold" style={{ color: sColor }}>{sideStr}</td>
      <td className="py-0.5 pr-2">
        <div className="flex items-center gap-1">
          <span className="text-[var(--terminal-cyan)] font-mono">{truncateAddress(pos.owner, 3)}</span>
          <ExplorerLink type="address" address={pos.owner} network={network} />
        </div>
      </td>
      <td className="py-0.5 pr-2 text-right font-mono">{formatSol(pos.size, 2)}</td>
      <td className="py-0.5 pr-2 text-right font-mono">
        {pos.entryPrice > 0 ? `$${pos.entryPrice.toFixed(2)}` : "-"}
      </td>
      <td className="py-0.5 pr-2 text-right font-mono" style={{ color: pos.unrealizedPnl >= 0 ? "var(--terminal-green)" : "var(--terminal-red)" }}>
        {pos.unrealizedPnl >= 0 ? "+" : ""}{formatSol(pos.unrealizedPnl, 4)}
      </td>
      <td className="py-0.5 pr-2 text-right">
        <HealthBar health={pos.marginHealth} />
      </td>
      <td className="py-0.5 text-right font-bold uppercase" style={{ color: statusColor(pos.status) }}>
        {pos.status === "safe" ? "SAFE" : pos.status === "at_risk" ? "RISK" : "LIQ"}
      </td>
    </tr>
  )
}

function HealthBar({ health }: { health: number }) {
  const color =
    health >= 80 ? "var(--terminal-green)" :
    health >= 40 ? "var(--terminal-amber)" :
    "var(--terminal-red)"

  return (
    <div className="flex items-center gap-1 justify-end">
      <div className="w-12 h-1.5 bg-[var(--terminal-bg)] border border-[var(--terminal-border)]">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${Math.min(100, health)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[9px] font-mono w-6 text-right" style={{ color }}>
        {health}
      </span>
    </div>
  )
}

// ── LPs Panel ────────────────────────────────────────────────────────────

function LPsPanel({ data }: { data: SlabDetail }) {
  if (data.lps.length === 0) return null

  return (
    <TerminalPanel title={`Liquidity Providers (${data.lps.length})`}>
      <div className="max-h-[300px] overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-[var(--terminal-dim)] text-left uppercase">
              <th className="pb-1 pr-2">IDX</th>
              <th className="pb-1 pr-2">OWNER</th>
              <th className="pb-1 pr-2 text-right">CAPITAL (SOL)</th>
              <th className="pb-1 pr-2 text-right">PNL (SOL)</th>
              <th className="pb-1 pr-2 text-right">POSITION</th>
              <th className="pb-1 text-right">MATCHER</th>
            </tr>
          </thead>
          <tbody>
            {data.lps.map((lp) => (
              <LPRow key={lp.accountIndex} lp={lp} network={data.network} />
            ))}
          </tbody>
        </table>
      </div>
    </TerminalPanel>
  )
}

function LPRow({ lp, network }: { lp: SlabLP; network: "devnet" | "mainnet" }) {
  const isZeroMatcher = lp.matcherContext === "11111111111111111111111111111111"
  return (
    <tr className="border-b border-dotted border-[var(--terminal-border)] hover:bg-[var(--terminal-hover)] transition-colors">
      <td className="py-0.5 pr-2 text-[var(--terminal-cyan)]">{lp.accountIndex}</td>
      <td className="py-0.5 pr-2">
        <div className="flex items-center gap-1">
          <span className="text-[var(--terminal-cyan)] font-mono">{truncateAddress(lp.owner, 3)}</span>
          <ExplorerLink type="address" address={lp.owner} network={network} />
        </div>
      </td>
      <td className="py-0.5 pr-2 text-right font-mono text-[var(--terminal-green)]">
        {formatSol(lp.collateral)}
      </td>
      <td
        className="py-0.5 pr-2 text-right font-mono"
        style={{ color: lp.pnl >= 0 ? "var(--terminal-green)" : "var(--terminal-red)" }}
      >
        {lp.pnl >= 0 ? "+" : ""}{formatSol(lp.pnl)}
      </td>
      <td className="py-0.5 pr-2 text-right font-mono text-[var(--terminal-dim)]">
        {lp.positionSize === "0" ? "-" : lp.positionSize}
      </td>
      <td className="py-0.5 text-right">
        {isZeroMatcher ? (
          <span className="text-[var(--terminal-dim)]">NONE</span>
        ) : (
          <div className="flex items-center gap-1 justify-end">
            <span className="text-[var(--terminal-cyan)] font-mono">{truncateAddress(lp.matcherContext, 3)}</span>
            <ExplorerLink type="address" address={lp.matcherContext} network={network} />
          </div>
        )}
      </td>
    </tr>
  )
}

// ── Main View ────────────────────────────────────────────────────────────

export function SlabDetailView() {
  const { selectedSlab, selectedSlabProgram, selectedSlabNetwork } = useNavigation()
  const { data, isLoading, error } = useSlabDetail(selectedSlab)

  if (!selectedSlab) {
    return (
      <TerminalPanel title="Slab Detail">
        <div className="py-8 text-center text-[10px] text-[var(--terminal-dim)]">
          NO SLAB SELECTED — GO TO RADAR AND CLICK A SLAB
        </div>
      </TerminalPanel>
    )
  }

  if (isLoading || !data) {
    return (
      <TerminalPanel title="Slab Detail" className="h-full">
        <div className="flex items-center justify-center py-8">
          <span className="text-xs text-[var(--terminal-green)] animate-blink-cursor">{"\u2588"}</span>
          <span className="ml-2 text-[10px] text-[var(--terminal-dim)]">
            LOADING SLAB {truncateAddress(selectedSlab, 6)}...
          </span>
        </div>
      </TerminalPanel>
    )
  }

  return (
    <div className="flex flex-col gap-px">
      {/* Header bar with back button */}
      <div className="flex items-center justify-between gap-2 px-1 py-1">
        <BackButton />
        <div className="flex items-center gap-2 text-[10px]">
          {selectedSlabProgram && (
            <span className="font-bold text-[var(--terminal-green)]">
              {selectedSlabProgram.toUpperCase()}
            </span>
          )}
          {selectedSlabNetwork && (
            <span
              className="px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider border"
              style={{
                color: selectedSlabNetwork === "mainnet" ? "var(--terminal-green)" : "var(--terminal-amber)",
                borderColor: selectedSlabNetwork === "mainnet" ? "var(--terminal-green)" : "var(--terminal-amber)",
              }}
            >
              {selectedSlabNetwork}
            </span>
          )}
          <span className="text-[var(--terminal-cyan)] font-mono">
            {truncateAddress(selectedSlab, 6)}
          </span>
          <ExplorerLink
            type="address"
            address={selectedSlab}
            network={data.network}
          />
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 text-[10px] text-[var(--terminal-red)] border border-[var(--terminal-red)]">
          ERROR: {error.message}
        </div>
      )}

      {/* Market overview + config */}
      <div className="grid grid-cols-1 gap-px lg:grid-cols-2">
        <MarketOverviewPanel data={data} />
        <ConfigPanel data={data} />
      </div>

      {/* Positions */}
      <PositionsPanel data={data} />

      {/* LPs */}
      <LPsPanel data={data} />
    </div>
  )
}
