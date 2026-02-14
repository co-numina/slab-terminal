"use client"

import { useState, useCallback, useRef, useMemo } from "react"
import type { SlabDetail, SlabPosition } from "@/hooks/use-slab-detail"

// ── Constants ──────────────────────────────────────────────────────────────

const MAP_HEIGHT = 180
const PADDING = { top: 12, right: 56, bottom: 22, left: 4 }

const COLOR_GREEN = "#00ff41"
const COLOR_RED = "#ff0040"
const COLOR_AMBER = "#ffaa00"
const COLOR_CYAN = "#00d4ff"
const COLOR_DIM = "#5a6672"
const COLOR_GRID = "rgba(30, 41, 59, 0.6)"
const COLOR_BORDER = "#1e293b"
const COLOR_CROSSHAIR = "rgba(255, 170, 0, 0.4)"
const COLOR_BG = "#0a0a0a"

// ── Helpers ────────────────────────────────────────────────────────────────

function niceAxisValues(min: number, max: number, steps: number): number[] {
  if (min === max) return [min - 1, min, min + 1]
  const range = max - min
  const rawStep = range / steps
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const residual = rawStep / magnitude
  let niceStep: number
  if (residual <= 1.5) niceStep = magnitude
  else if (residual <= 3.5) niceStep = 2 * magnitude
  else if (residual <= 7.5) niceStep = 5 * magnitude
  else niceStep = 10 * magnitude
  const start = Math.floor(min / niceStep) * niceStep
  const values: number[] = []
  for (let v = start; v <= max + niceStep * 0.5; v += niceStep) values.push(v)
  return values
}

function healthColor(h: number): string {
  if (h >= 80) return COLOR_GREEN
  if (h >= 40) return COLOR_AMBER
  return COLOR_RED
}

type ViewMode = "positions" | "depth" | "health"

// ── Position Map ───────────────────────────────────────────────────────────
// Scatter: X = entry price, Y = position size
// Longs = green circles, Shorts = red circles
// Mark price = vertical dashed line
// Liquidation prices = small triangles

function PositionMapSVG({
  data,
  positions,
}: {
  data: SlabDetail
  positions: SlabPosition[]
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const chartW = 600
  const innerW = chartW - PADDING.left - PADDING.right
  const innerH = MAP_HEIGHT - PADDING.top - PADDING.bottom

  // Only non-flat, non-LP positions with valid entry prices
  const traders = useMemo(
    () => positions.filter((p) => !p.isLP && p.side !== "flat" && p.entryPrice > 0 && p.size > 0),
    [positions],
  )

  // Compute axes
  const { xMin, xMax, xTicks, yMax, yTicks } = useMemo(() => {
    if (traders.length === 0) {
      const markP = data.solUsdPrice || 100
      return {
        xMin: markP * 0.95,
        xMax: markP * 1.05,
        xTicks: niceAxisValues(markP * 0.95, markP * 1.05, 4),
        yMax: 1,
        yTicks: [0, 0.5, 1],
      }
    }

    // X = price range: include entry prices, liquidation prices, and mark price
    const allPrices = traders.map((p) => p.entryPrice)
    const liqPrices = traders.filter((p) => p.liquidationPrice > 0).map((p) => p.liquidationPrice)
    if (data.solUsdPrice > 0) allPrices.push(data.solUsdPrice)
    allPrices.push(...liqPrices)

    let pMin = Math.min(...allPrices)
    let pMax = Math.max(...allPrices)
    if (pMin === pMax) {
      pMin -= Math.abs(pMin * 0.02) || 1
      pMax += Math.abs(pMax * 0.02) || 1
    }
    const pPad = (pMax - pMin) * 0.08
    pMin -= pPad
    pMax += pPad

    // Y = absolute size
    const sizes = traders.map((p) => Math.abs(p.size))
    let sMax = Math.max(...sizes)
    if (sMax === 0) sMax = 1
    sMax *= 1.15 // top padding

    const xt = niceAxisValues(pMin, pMax, 5)
    const yt = niceAxisValues(0, sMax, 3)

    return {
      xMin: Math.min(pMin, xt[0]),
      xMax: Math.max(pMax, xt[xt.length - 1]),
      xTicks: xt,
      yMax: Math.max(sMax, yt[yt.length - 1]),
      yTicks: yt,
    }
  }, [traders, data.solUsdPrice])

  const xScale = useCallback((v: number) => PADDING.left + ((v - xMin) / (xMax - xMin)) * innerW, [xMin, xMax, innerW])
  const yScale = useCallback((v: number) => PADDING.top + (1 - v / yMax) * innerH, [yMax, innerH])

  const markPriceX = data.solUsdPrice > 0 ? xScale(data.solUsdPrice) : null

  // Hover handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (traders.length === 0 || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width) * chartW
      const my = ((e.clientY - rect.top) / rect.height) * MAP_HEIGHT

      // Find closest trader
      let closest = -1
      let bestDist = 20 // pixel threshold
      for (let i = 0; i < traders.length; i++) {
        const px = xScale(traders[i].entryPrice)
        const py = yScale(Math.abs(traders[i].size))
        const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2)
        if (dist < bestDist) {
          bestDist = dist
          closest = i
        }
      }
      setHover(closest >= 0 ? closest : null)
    },
    [traders, xScale, yScale, chartW],
  )

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${chartW} ${MAP_HEIGHT}`}
      preserveAspectRatio="none"
      className="w-full h-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
      style={{ cursor: traders.length > 0 ? "crosshair" : "default" }}
    >
      {/* Grid lines (horizontal - size) */}
      {yTicks.map((tick) => {
        const y = yScale(tick)
        return (
          <g key={`y-${tick}`}>
            <line x1={PADDING.left} x2={PADDING.left + innerW} y1={y} y2={y} stroke={COLOR_GRID} strokeDasharray="2 3" strokeWidth={0.5} />
            <text x={PADDING.left + innerW + 4} y={y + 3} fill={COLOR_DIM} fontSize={7} fontFamily="monospace">
              {tick < 1 ? tick.toFixed(2) : tick.toFixed(1)}
            </text>
          </g>
        )
      })}

      {/* Grid lines (vertical - price) */}
      {xTicks.map((tick) => {
        const x = xScale(tick)
        return (
          <g key={`x-${tick}`}>
            <line x1={x} x2={x} y1={PADDING.top} y2={PADDING.top + innerH} stroke={COLOR_GRID} strokeDasharray="2 3" strokeWidth={0.5} />
            <text x={x} y={MAP_HEIGHT - 3} fill={COLOR_DIM} fontSize={7} fontFamily="monospace" textAnchor="middle">
              ${tick.toFixed(0)}
            </text>
          </g>
        )
      })}

      {/* Axis labels */}
      <text x={PADDING.left + innerW + 4} y={PADDING.top - 2} fill={COLOR_DIM} fontSize={6} fontFamily="monospace">
        SIZE
      </text>
      <text x={PADDING.left + innerW / 2} y={MAP_HEIGHT - 12} fill={COLOR_DIM} fontSize={6} fontFamily="monospace" textAnchor="middle">
        ENTRY PRICE (USD)
      </text>

      {/* Mark price line */}
      {markPriceX !== null && (
        <>
          <line
            x1={markPriceX} x2={markPriceX}
            y1={PADDING.top} y2={PADDING.top + innerH}
            stroke={COLOR_CYAN} strokeWidth={1} strokeDasharray="4 2" opacity={0.7}
          />
          <text x={markPriceX} y={PADDING.top - 2} fill={COLOR_CYAN} fontSize={7} fontFamily="monospace" fontWeight="bold" textAnchor="middle">
            MARK ${data.solUsdPrice.toFixed(2)}
          </text>
        </>
      )}

      {/* Liquidation price markers (small triangles on the bottom) */}
      {traders.map((p, i) => {
        if (p.liquidationPrice <= 0) return null
        const lx = xScale(p.liquidationPrice)
        // Only draw if within visible range
        if (lx < PADDING.left || lx > PADDING.left + innerW) return null
        const baseY = PADDING.top + innerH
        const color = p.side === "long" ? COLOR_GREEN : COLOR_RED
        return (
          <polygon
            key={`liq-${i}`}
            points={`${lx},${baseY - 4} ${lx - 2},${baseY} ${lx + 2},${baseY}`}
            fill={color}
            opacity={0.3}
          />
        )
      })}

      {/* Position dots */}
      {traders.map((p, i) => {
        const cx = xScale(p.entryPrice)
        const cy = yScale(Math.abs(p.size))
        const color = p.side === "long" ? COLOR_GREEN : COLOR_RED
        const isHovered = hover === i
        // Size based on collateral (bigger = more collateral)
        const r = Math.max(3, Math.min(8, Math.sqrt(p.collateral) * 2))

        return (
          <g key={`pos-${i}`}>
            {/* Glow */}
            <circle cx={cx} cy={cy} r={r + 2} fill={color} opacity={isHovered ? 0.3 : 0.08} />
            {/* Dot */}
            <circle
              cx={cx} cy={cy} r={isHovered ? r + 1 : r}
              fill={color}
              stroke={isHovered ? "#fff" : "none"}
              strokeWidth={0.5}
              opacity={isHovered ? 1 : 0.75}
            />
            {/* Entry-to-liq line */}
            {p.liquidationPrice > 0 && (
              <line
                x1={cx} y1={cy}
                x2={xScale(p.liquidationPrice)} y2={cy}
                stroke={color} strokeWidth={0.5} strokeDasharray="1 2" opacity={0.25}
              />
            )}
          </g>
        )
      })}

      {/* Hover tooltip */}
      {hover !== null && hover < traders.length && (() => {
        const p = traders[hover]
        const cx = xScale(p.entryPrice)
        const cy = yScale(Math.abs(p.size))
        const tooltipW = 120
        const tooltipH = 42
        const tx = cx + tooltipW + 10 > chartW ? cx - tooltipW - 6 : cx + 6
        const ty = Math.max(PADDING.top, Math.min(cy - tooltipH / 2, MAP_HEIGHT - PADDING.bottom - tooltipH))
        const sideStr = p.side.toUpperCase()
        const sideColor = p.side === "long" ? COLOR_GREEN : COLOR_RED

        return (
          <>
            {/* Crosshair */}
            <line x1={cx} x2={cx} y1={PADDING.top} y2={PADDING.top + innerH} stroke={COLOR_CROSSHAIR} strokeWidth={0.5} strokeDasharray="2 2" />
            <line x1={PADDING.left} x2={PADDING.left + innerW} y1={cy} y2={cy} stroke={COLOR_CROSSHAIR} strokeWidth={0.5} strokeDasharray="2 2" />

            {/* Tooltip bg */}
            <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={1} fill="#0d1117" stroke={COLOR_BORDER} strokeWidth={0.5} />
            {/* Side + size */}
            <text x={tx + 4} y={ty + 11} fill={sideColor} fontSize={8} fontFamily="monospace" fontWeight="bold">
              {sideStr} {Math.abs(p.size).toFixed(2)} SOL
            </text>
            {/* Entry price */}
            <text x={tx + 4} y={ty + 22} fill={COLOR_DIM} fontSize={7} fontFamily="monospace">
              Entry: ${p.entryPrice.toFixed(2)}  Liq: ${p.liquidationPrice > 0 ? `$${p.liquidationPrice.toFixed(2)}` : "N/A"}
            </text>
            {/* PnL + Health */}
            <text x={tx + 4} y={ty + 33} fill={COLOR_DIM} fontSize={7} fontFamily="monospace">
              PnL: <tspan fill={p.unrealizedPnl >= 0 ? COLOR_GREEN : COLOR_RED}>
                {p.unrealizedPnl >= 0 ? "+" : ""}{p.unrealizedPnl.toFixed(4)}
              </tspan>
              {"  "}Health: <tspan fill={healthColor(p.marginHealth)}>{p.marginHealth}</tspan>
            </text>
          </>
        )
      })()}

      {/* Empty state */}
      {traders.length === 0 && (
        <text x={chartW / 2} y={MAP_HEIGHT / 2} fill={COLOR_DIM} fontSize={10} fontFamily="monospace" textAnchor="middle">
          NO ACTIVE TRADER POSITIONS
        </text>
      )}
    </svg>
  )
}

// ── Market Depth Bar ───────────────────────────────────────────────────────
// Horizontal stacked bar: longs vs shorts

function DepthBarSVG({ data }: { data: SlabDetail }) {
  const chartW = 600
  const barH = 28
  const totalH = 120

  const longSize = data.summary.totalLongNotional
  const shortSize = data.summary.totalShortNotional
  const total = longSize + shortSize
  const longPct = total > 0 ? longSize / total : 0.5
  const shortPct = total > 0 ? shortSize / total : 0.5

  const insuranceSol = data.insuranceFundSol
  const tvlSol = data.vaultBalanceSol
  const oiSol = data.openInterestSol
  const insuranceRatio = oiSol > 0 ? insuranceSol / oiSol : 0
  const utilizationPct = data.maxAccountCapacity > 0 ? (data.engine.numUsedAccounts / data.maxAccountCapacity) * 100 : 0

  return (
    <svg viewBox={`0 0 ${chartW} ${totalH}`} preserveAspectRatio="none" className="w-full h-full">
      {/* Long/Short bar */}
      <text x={4} y={12} fill={COLOR_DIM} fontSize={7} fontFamily="monospace">LONG / SHORT BALANCE</text>

      {/* Bar background */}
      <rect x={4} y={18} width={chartW - 60} height={barH} rx={1} fill={COLOR_BG} stroke={COLOR_BORDER} strokeWidth={0.5} />

      {/* Long side */}
      <rect x={4} y={18} width={Math.max(1, (chartW - 60) * longPct)} height={barH} rx={1} fill={COLOR_GREEN} opacity={0.6} />

      {/* Short side */}
      <rect
        x={4 + (chartW - 60) * longPct}
        y={18}
        width={Math.max(1, (chartW - 60) * shortPct)}
        height={barH}
        rx={1}
        fill={COLOR_RED}
        opacity={0.6}
      />

      {/* Center divider */}
      {total > 0 && (
        <line
          x1={4 + (chartW - 60) * longPct}
          x2={4 + (chartW - 60) * longPct}
          y1={16}
          y2={48}
          stroke="#fff"
          strokeWidth={0.5}
          opacity={0.4}
        />
      )}

      {/* Labels */}
      <text x={10} y={36} fill={COLOR_GREEN} fontSize={9} fontFamily="monospace" fontWeight="bold">
        LONG {(longPct * 100).toFixed(0)}%
      </text>
      <text x={chartW - 60} y={36} fill={COLOR_RED} fontSize={9} fontFamily="monospace" fontWeight="bold" textAnchor="end">
        {(shortPct * 100).toFixed(0)}% SHORT
      </text>

      {/* Size labels to the right */}
      <text x={chartW - 52} y={26} fill={COLOR_GREEN} fontSize={7} fontFamily="monospace">
        {longSize.toFixed(1)}
      </text>
      <text x={chartW - 52} y={38} fill={COLOR_RED} fontSize={7} fontFamily="monospace">
        {shortSize.toFixed(1)}
      </text>
      <text x={chartW - 52} y={48} fill={COLOR_DIM} fontSize={6} fontFamily="monospace">SOL</text>

      {/* Metrics row */}
      <text x={4} y={66} fill={COLOR_DIM} fontSize={7} fontFamily="monospace">MARKET METRICS</text>

      {/* TVL bar */}
      <text x={4} y={80} fill={COLOR_DIM} fontSize={7} fontFamily="monospace">TVL</text>
      <rect x={40} y={73} width={200} height={10} rx={1} fill={COLOR_BG} stroke={COLOR_BORDER} strokeWidth={0.5} />
      <rect x={40} y={73} width={200} height={10} rx={1} fill={COLOR_GREEN} opacity={0.4} />
      <text x={244} y={82} fill={COLOR_GREEN} fontSize={7} fontFamily="monospace">
        {tvlSol.toFixed(2)} SOL
      </text>

      {/* OI bar */}
      <text x={4} y={95} fill={COLOR_DIM} fontSize={7} fontFamily="monospace">OI</text>
      <rect x={40} y={88} width={200} height={10} rx={1} fill={COLOR_BG} stroke={COLOR_BORDER} strokeWidth={0.5} />
      <rect x={40} y={88} width={Math.min(200, tvlSol > 0 ? (oiSol / tvlSol) * 200 : 0)} height={10} rx={1} fill={COLOR_AMBER} opacity={0.5} />
      <text x={244} y={97} fill={COLOR_AMBER} fontSize={7} fontFamily="monospace">
        {oiSol.toFixed(2)} SOL
      </text>

      {/* Insurance bar */}
      <text x={4} y={110} fill={COLOR_DIM} fontSize={7} fontFamily="monospace">INS</text>
      <rect x={40} y={103} width={200} height={10} rx={1} fill={COLOR_BG} stroke={COLOR_BORDER} strokeWidth={0.5} />
      <rect x={40} y={103} width={Math.min(200, tvlSol > 0 ? (insuranceSol / tvlSol) * 200 : 0)} height={10} rx={1} fill={COLOR_CYAN} opacity={0.5} />
      <text x={244} y={112} fill={COLOR_CYAN} fontSize={7} fontFamily="monospace">
        {insuranceSol.toFixed(4)} SOL ({(insuranceRatio * 100).toFixed(1)}% of OI)
      </text>

      {/* Utilization on right side */}
      <text x={380} y={80} fill={COLOR_DIM} fontSize={7} fontFamily="monospace">UTILIZATION</text>
      <rect x={380} y={88} width={160} height={18} rx={1} fill={COLOR_BG} stroke={COLOR_BORDER} strokeWidth={0.5} />
      <rect x={380} y={88} width={Math.min(160, utilizationPct * 1.6)} height={18} rx={1} fill={utilizationPct > 80 ? COLOR_RED : utilizationPct > 50 ? COLOR_AMBER : COLOR_GREEN} opacity={0.4} />
      <text x={460} y={101} fill="#fff" fontSize={9} fontFamily="monospace" fontWeight="bold" textAnchor="middle">
        {data.engine.numUsedAccounts} / {data.maxAccountCapacity} ({utilizationPct.toFixed(0)}%)
      </text>
    </svg>
  )
}

// ── Health Heatmap ─────────────────────────────────────────────────────────
// Grid of cells, one per account, colored by margin health

function HealthHeatmapSVG({ positions }: { positions: SlabPosition[] }) {
  const chartW = 600
  const totalH = 140

  // Only active positions (not flat)
  const active = useMemo(
    () => positions.filter((p) => p.side !== "flat" || p.isLP).sort((a, b) => a.marginHealth - b.marginHealth),
    [positions],
  )

  if (active.length === 0) {
    return (
      <svg viewBox={`0 0 ${chartW} 40`} preserveAspectRatio="none" className="w-full" style={{ height: 40 }}>
        <text x={chartW / 2} y={24} fill={COLOR_DIM} fontSize={10} fontFamily="monospace" textAnchor="middle">
          NO ACTIVE POSITIONS
        </text>
      </svg>
    )
  }

  // Compute grid dimensions
  const cols = Math.ceil(Math.sqrt(active.length * (chartW / totalH)))
  const rows = Math.ceil(active.length / cols)
  const cellW = (chartW - 8) / cols
  const cellH = Math.min(14, (totalH - 30) / rows)
  const actualH = 24 + rows * cellH + 4

  // Distribution stats
  const safe = active.filter((p) => p.status === "safe").length
  const atRisk = active.filter((p) => p.status === "at_risk").length
  const liquidatable = active.filter((p) => p.status === "liquidatable").length

  return (
    <svg viewBox={`0 0 ${chartW} ${actualH}`} preserveAspectRatio="none" className="w-full" style={{ height: Math.max(60, actualH) }}>
      {/* Header stats */}
      <text x={4} y={11} fill={COLOR_GREEN} fontSize={8} fontFamily="monospace" fontWeight="bold">
        SAFE: {safe}
      </text>
      <text x={100} y={11} fill={COLOR_AMBER} fontSize={8} fontFamily="monospace" fontWeight="bold">
        AT RISK: {atRisk}
      </text>
      <text x={210} y={11} fill={COLOR_RED} fontSize={8} fontFamily="monospace" fontWeight="bold">
        LIQUIDATABLE: {liquidatable}
      </text>

      {/* Legend */}
      <rect x={chartW - 160} y={3} width={8} height={8} fill={COLOR_GREEN} opacity={0.7} rx={1} />
      <text x={chartW - 148} y={11} fill={COLOR_DIM} fontSize={7} fontFamily="monospace">&gt;80</text>
      <rect x={chartW - 120} y={3} width={8} height={8} fill={COLOR_AMBER} opacity={0.7} rx={1} />
      <text x={chartW - 108} y={11} fill={COLOR_DIM} fontSize={7} fontFamily="monospace">40-80</text>
      <rect x={chartW - 74} y={3} width={8} height={8} fill={COLOR_RED} opacity={0.7} rx={1} />
      <text x={chartW - 62} y={11} fill={COLOR_DIM} fontSize={7} fontFamily="monospace">&lt;40</text>

      {/* Cells */}
      {active.map((p, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = 4 + col * cellW
        const y = 20 + row * cellH
        const color = healthColor(p.marginHealth)
        // Opacity based on health (lower health = more opaque/urgent)
        const opacity = p.marginHealth < 40 ? 0.9 : p.marginHealth < 80 ? 0.6 : 0.4

        return (
          <g key={`cell-${i}`}>
            <rect
              x={x + 0.5}
              y={y + 0.5}
              width={cellW - 1}
              height={cellH - 1}
              rx={1}
              fill={color}
              opacity={opacity}
              stroke={COLOR_BG}
              strokeWidth={0.5}
            />
            {/* Show health number if cells are big enough */}
            {cellW > 16 && cellH > 9 && (
              <text
                x={x + cellW / 2}
                y={y + cellH / 2 + 3}
                fill="#000"
                fontSize={Math.min(7, cellH - 3)}
                fontFamily="monospace"
                fontWeight="bold"
                textAnchor="middle"
              >
                {p.marginHealth}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export function MarketVisual({ data }: { data: SlabDetail }) {
  const [view, setView] = useState<ViewMode>("positions")

  const views: { key: ViewMode; label: string }[] = [
    { key: "positions", label: "POSITIONS" },
    { key: "depth", label: "DEPTH" },
    { key: "health", label: "HEALTH" },
  ]

  return (
    <div className="flex flex-col gap-0">
      {/* View selector */}
      <div className="flex items-center gap-2 px-1 mb-1">
        {views.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border transition-all select-none"
            style={{
              color: view === v.key ? COLOR_GREEN : COLOR_DIM,
              borderColor: view === v.key ? COLOR_GREEN : "transparent",
              backgroundColor: view === v.key ? "rgba(0, 255, 65, 0.07)" : "transparent",
            }}
          >
            {v.label}
          </button>
        ))}
        <span className="flex-1" />
        <span className="text-[9px] text-[var(--terminal-dim)]">
          {data.summary.totalPositions} positions
        </span>
      </div>

      {/* Chart area */}
      <div
        className="relative w-full border border-[var(--terminal-border)] bg-[var(--terminal-bg)]"
        style={{ height: view === "health" ? "auto" : view === "depth" ? 120 : MAP_HEIGHT }}
      >
        {view === "positions" && (
          <PositionMapSVG data={data} positions={data.positions} />
        )}
        {view === "depth" && (
          <DepthBarSVG data={data} />
        )}
        {view === "health" && (
          <div className="p-1">
            <HealthHeatmapSVG positions={data.positions} />
          </div>
        )}
      </div>
    </div>
  )
}
