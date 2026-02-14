"use client"

import { useState, useCallback, useRef, useMemo } from "react"
import type { SlabDetail, SlabPosition } from "@/hooks/use-slab-detail"

// ── Constants ──────────────────────────────────────────────────────────────

const MAP_HEIGHT = 180
const PADDING = { top: 14, right: 60, bottom: 24, left: 6 }

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
  if (rawStep === 0) return [min]
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep))))
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

/** Format price smartly based on magnitude */
function fmtPrice(v: number): string {
  if (v >= 10000) return `$${v.toFixed(0)}`
  if (v >= 100) return `$${v.toFixed(1)}`
  if (v >= 1) return `$${v.toFixed(2)}`
  if (v >= 0.01) return `$${v.toFixed(4)}`
  return `$${v.toExponential(1)}`
}

/** Format SOL amounts */
function fmtSol(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`
  if (v >= 1) return v.toFixed(2)
  if (v >= 0.001) return v.toFixed(4)
  return v.toFixed(6)
}

// ── Position Map ───────────────────────────────────────────────────────────

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
      // Empty market — show range around mark price
      const markP = data.solUsdPrice || 100
      const spread = Math.max(markP * 0.1, 1)
      return {
        xMin: markP - spread,
        xMax: markP + spread,
        xTicks: niceAxisValues(markP - spread, markP + spread, 4),
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
      pMin -= Math.abs(pMin * 0.05) || 1
      pMax += Math.abs(pMax * 0.05) || 1
    }
    const pPad = (pMax - pMin) * 0.1
    pMin -= pPad
    pMax += pPad

    // Y = absolute size
    const sizes = traders.map((p) => Math.abs(p.size))
    let sMax = Math.max(...sizes)
    if (sMax === 0) sMax = 1
    sMax *= 1.15

    const xt = niceAxisValues(pMin, pMax, 4)
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

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (traders.length === 0 || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width) * chartW
      const my = ((e.clientY - rect.top) / rect.height) * MAP_HEIGHT

      let closest = -1
      let bestDist = 25
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
      preserveAspectRatio="xMidYMid meet"
      className="w-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
      style={{ cursor: traders.length > 0 ? "crosshair" : "default" }}
    >
      {/* Y-axis grid (size) */}
      {yTicks.map((tick) => {
        const y = yScale(tick)
        return (
          <g key={`y-${tick}`}>
            <line x1={PADDING.left} x2={PADDING.left + innerW} y1={y} y2={y} stroke={COLOR_GRID} strokeDasharray="2 3" strokeWidth={0.5} />
            <text x={PADDING.left + innerW + 4} y={y + 3} fill={COLOR_DIM} fontSize={7} fontFamily="monospace">
              {fmtSol(tick)}
            </text>
          </g>
        )
      })}

      {/* X-axis grid (price) */}
      {xTicks.map((tick, i) => {
        const x = xScale(tick)
        // Skip ticks too close to edges
        if (x < PADDING.left + 10 || x > PADDING.left + innerW - 10) return null
        return (
          <g key={`x-${i}`}>
            <line x1={x} x2={x} y1={PADDING.top} y2={PADDING.top + innerH} stroke={COLOR_GRID} strokeDasharray="2 3" strokeWidth={0.5} />
            <text x={x} y={MAP_HEIGHT - 4} fill={COLOR_DIM} fontSize={7} fontFamily="monospace" textAnchor="middle">
              {fmtPrice(tick)}
            </text>
          </g>
        )
      })}

      {/* Axis labels */}
      <text x={PADDING.left + innerW + 4} y={PADDING.top - 3} fill={COLOR_DIM} fontSize={6} fontFamily="monospace">
        SIZE (SOL)
      </text>

      {/* Mark price line */}
      {markPriceX !== null && markPriceX >= PADDING.left && markPriceX <= PADDING.left + innerW && (
        <>
          <line
            x1={markPriceX} x2={markPriceX}
            y1={PADDING.top} y2={PADDING.top + innerH}
            stroke={COLOR_CYAN} strokeWidth={1} strokeDasharray="4 2" opacity={0.7}
          />
          <text x={markPriceX} y={PADDING.top - 3} fill={COLOR_CYAN} fontSize={7} fontFamily="monospace" fontWeight="bold" textAnchor="middle">
            MARK {fmtPrice(data.solUsdPrice)}
          </text>
        </>
      )}

      {/* Liquidation price markers */}
      {traders.map((p, i) => {
        if (p.liquidationPrice <= 0) return null
        const lx = xScale(p.liquidationPrice)
        if (lx < PADDING.left || lx > PADDING.left + innerW) return null
        const baseY = PADDING.top + innerH
        const color = p.side === "long" ? COLOR_GREEN : COLOR_RED
        return (
          <polygon
            key={`liq-${i}`}
            points={`${lx},${baseY - 4} ${lx - 2.5},${baseY} ${lx + 2.5},${baseY}`}
            fill={color}
            opacity={0.35}
          />
        )
      })}

      {/* Position dots */}
      {traders.map((p, i) => {
        const cx = xScale(p.entryPrice)
        const cy = yScale(Math.abs(p.size))
        const color = p.side === "long" ? COLOR_GREEN : COLOR_RED
        const isHovered = hover === i
        const r = Math.max(3, Math.min(8, Math.sqrt(p.collateral) * 2))

        return (
          <g key={`pos-${i}`}>
            <circle cx={cx} cy={cy} r={r + 2} fill={color} opacity={isHovered ? 0.3 : 0.08} />
            <circle
              cx={cx} cy={cy} r={isHovered ? r + 1 : r}
              fill={color}
              stroke={isHovered ? "#fff" : "none"}
              strokeWidth={0.5}
              opacity={isHovered ? 1 : 0.75}
            />
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
        const tooltipW = 130
        const tooltipH = 42
        const tx = cx + tooltipW + 10 > chartW ? cx - tooltipW - 6 : cx + 6
        const ty = Math.max(PADDING.top, Math.min(cy - tooltipH / 2, MAP_HEIGHT - PADDING.bottom - tooltipH))
        const sColor = p.side === "long" ? COLOR_GREEN : COLOR_RED

        return (
          <>
            <line x1={cx} x2={cx} y1={PADDING.top} y2={PADDING.top + innerH} stroke={COLOR_CROSSHAIR} strokeWidth={0.5} strokeDasharray="2 2" />
            <line x1={PADDING.left} x2={PADDING.left + innerW} y1={cy} y2={cy} stroke={COLOR_CROSSHAIR} strokeWidth={0.5} strokeDasharray="2 2" />

            <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={1} fill="#0d1117" stroke={COLOR_BORDER} strokeWidth={0.5} />
            <text x={tx + 4} y={ty + 11} fill={sColor} fontSize={8} fontFamily="monospace" fontWeight="bold">
              {p.side.toUpperCase()} {fmtSol(Math.abs(p.size))} SOL
            </text>
            <text x={tx + 4} y={ty + 22} fill={COLOR_DIM} fontSize={7} fontFamily="monospace">
              Entry: {fmtPrice(p.entryPrice)}  Liq: {p.liquidationPrice > 0 ? fmtPrice(p.liquidationPrice) : "N/A"}
            </text>
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
        <text x={chartW / 2} y={MAP_HEIGHT / 2 + 4} fill={COLOR_DIM} fontSize={10} fontFamily="monospace" textAnchor="middle">
          NO OPEN TRADER POSITIONS
        </text>
      )}
    </svg>
  )
}

// ── Market Depth Panel ────────────────────────────────────────────────────
// Rendered as stacked div rows instead of a single SVG — scales better in narrow columns

function DepthPanel({ data }: { data: SlabDetail }) {
  const longSize = data.summary.totalLongNotional
  const shortSize = data.summary.totalShortNotional
  const total = longSize + shortSize
  const hasPositions = total > 0
  const longPct = hasPositions ? longSize / total : 0
  const shortPct = hasPositions ? shortSize / total : 0

  const insuranceSol = data.insuranceFundSol
  const tvlSol = data.vaultBalanceSol
  const oiSol = data.openInterestSol
  const insuranceRatio = oiSol > 0 ? insuranceSol / oiSol : tvlSol > 0 ? 1 : 0
  const utilizationPct = data.maxAccountCapacity > 0 ? (data.engine.numUsedAccounts / data.maxAccountCapacity) * 100 : 0
  const utilColor = utilizationPct > 100 ? COLOR_RED : utilizationPct > 80 ? COLOR_AMBER : COLOR_GREEN

  return (
    <div className="flex flex-col gap-2 p-1.5 font-mono text-[9px]">
      {/* Long / Short Balance */}
      <div>
        <div className="text-[8px] uppercase tracking-wider mb-1" style={{ color: COLOR_DIM }}>Long / Short Balance</div>
        <div className="relative w-full h-6 border rounded-sm" style={{ borderColor: COLOR_BORDER, backgroundColor: COLOR_BG }}>
          {hasPositions ? (
            <>
              <div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{ width: `${longPct * 100}%`, backgroundColor: COLOR_GREEN, opacity: 0.5 }}
              />
              <div
                className="absolute inset-y-0 right-0 rounded-sm"
                style={{ width: `${shortPct * 100}%`, backgroundColor: COLOR_RED, opacity: 0.5 }}
              />
              <div className="absolute inset-0 flex items-center justify-between px-1.5 text-[8px] font-bold">
                <span style={{ color: COLOR_GREEN }}>LONG {(longPct * 100).toFixed(0)}%</span>
                <span style={{ color: COLOR_RED }}>{(shortPct * 100).toFixed(0)}% SHORT</span>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[8px]" style={{ color: COLOR_DIM }}>
              NO OPEN POSITIONS
            </div>
          )}
        </div>
        {hasPositions && (
          <div className="flex justify-between mt-0.5 text-[7px]" style={{ color: COLOR_DIM }}>
            <span style={{ color: COLOR_GREEN }}>{fmtSol(longSize)} SOL</span>
            <span style={{ color: COLOR_RED }}>{fmtSol(shortSize)} SOL</span>
          </div>
        )}
      </div>

      {/* Market Metrics */}
      <div>
        <div className="text-[8px] uppercase tracking-wider mb-1" style={{ color: COLOR_DIM }}>Market Metrics</div>
        <div className="flex flex-col gap-1">
          {/* TVL */}
          <MetricBar label="TVL" value={tvlSol} max={tvlSol} color={COLOR_GREEN} text={`${fmtSol(tvlSol)} SOL`} />
          {/* OI — relative to TVL */}
          <MetricBar label="OI" value={oiSol} max={tvlSol} color={COLOR_AMBER} text={oiSol > 0 ? `${fmtSol(oiSol)} SOL` : "NONE"} />
          {/* Insurance — relative to TVL */}
          <MetricBar
            label="INS"
            value={insuranceSol}
            max={tvlSol}
            color={COLOR_CYAN}
            text={insuranceSol > 0
              ? `${fmtSol(insuranceSol)} SOL${oiSol > 0 ? ` (${(insuranceRatio * 100).toFixed(1)}% of OI)` : ""}`
              : "NONE"
            }
          />
        </div>
      </div>

      {/* Utilization */}
      <div>
        <div className="text-[8px] uppercase tracking-wider mb-1" style={{ color: COLOR_DIM }}>Utilization</div>
        <div className="relative w-full h-4 border rounded-sm" style={{ borderColor: COLOR_BORDER, backgroundColor: COLOR_BG }}>
          <div
            className="absolute inset-y-0 left-0 rounded-sm"
            style={{ width: `${Math.min(100, utilizationPct)}%`, backgroundColor: utilColor, opacity: 0.4 }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold" style={{ color: "#fff" }}>
            {data.engine.numUsedAccounts} / {data.maxAccountCapacity} ({Math.round(utilizationPct)}%)
          </div>
        </div>
        {utilizationPct > 100 && (
          <div className="text-center text-[7px] mt-0.5" style={{ color: COLOR_RED }}>OVER CAPACITY</div>
        )}
      </div>
    </div>
  )
}

/** Reusable horizontal metric bar */
function MetricBar({ label, value, max, color, text }: {
  label: string
  value: number
  max: number
  color: string
  text: string
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-6 text-right text-[7px] shrink-0" style={{ color: COLOR_DIM }}>{label}</span>
      <div className="relative flex-1 h-2.5 border rounded-sm" style={{ borderColor: COLOR_BORDER, backgroundColor: COLOR_BG }}>
        <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.5 }} />
      </div>
      <span className="text-[7px] shrink-0" style={{ color: value > 0 ? color : COLOR_DIM }}>{text}</span>
    </div>
  )
}

// ── Exported Sub-components ───────────────────────────────────────────────
// The parent (slab-detail-view) lays these out in a 2-column grid

export function PositionMapPanel({ data }: { data: SlabDetail }) {
  return (
    <div className="border border-[var(--terminal-border)] bg-[var(--terminal-bg)]">
      <div className="px-1.5 py-0.5 border-b border-[var(--terminal-border)] flex items-center justify-between">
        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--terminal-green)]">Positions</span>
        <span className="text-[8px] text-[var(--terminal-dim)]">
          {data.positions.filter((p) => !p.isLP && p.side !== "flat" && p.entryPrice > 0).length} traders
        </span>
      </div>
      <PositionMapSVG data={data} positions={data.positions} />
    </div>
  )
}

export function DepthMetricsPanel({ data }: { data: SlabDetail }) {
  return (
    <div className="border border-[var(--terminal-border)] bg-[var(--terminal-bg)]">
      <div className="px-1.5 py-0.5 border-b border-[var(--terminal-border)] flex items-center justify-between">
        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--terminal-green)]">Depth</span>
        <span className="text-[8px] text-[var(--terminal-dim)]">
          {data.summary.totalPositions} positions
        </span>
      </div>
      <DepthPanel data={data} />
    </div>
  )
}

// ── Combined 2-column layout ──────────────────────────────────────────────

export function MarketVisual({ data }: { data: SlabDetail }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-px">
      <PositionMapPanel data={data} />
      <DepthMetricsPanel data={data} />
    </div>
  )
}
