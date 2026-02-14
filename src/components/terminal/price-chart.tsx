"use client"

import { useState, useCallback, useRef, useMemo } from "react"
import type { PricePoint } from "@/hooks/use-price-history"

// ── Constants ──────────────────────────────────────────────────────────────

const CHART_HEIGHT = 160
const PADDING = { top: 8, right: 52, bottom: 20, left: 4 }

// Terminal colors
const COLOR_GREEN = "#00ff41"
const COLOR_GREEN_DIM = "rgba(0, 255, 65, 0.15)"
const COLOR_GREEN_GLOW = "rgba(0, 255, 65, 0.4)"
const COLOR_GRID = "rgba(30, 41, 59, 0.6)"
const COLOR_DIM = "#5a6672"
const COLOR_BORDER = "#1e293b"
const COLOR_CROSSHAIR = "rgba(255, 170, 0, 0.5)"
const COLOR_AMBER = "#ffaa00"
const COLOR_CYAN = "#00d4ff"

// ── Types ──────────────────────────────────────────────────────────────────

type MetricKey = "p" | "tvl" | "oi"

interface MetricConfig {
  key: MetricKey
  label: string
  unit: string
  format: (v: number) => string
  color: string
}

const METRICS: MetricConfig[] = [
  { key: "p", label: "PRICE", unit: "USD", format: (v) => `$${v.toFixed(2)}`, color: COLOR_GREEN },
  { key: "tvl", label: "TVL", unit: "SOL", format: (v) => `${v.toFixed(2)}`, color: COLOR_CYAN },
  { key: "oi", label: "OI", unit: "SOL", format: (v) => `${v.toFixed(2)}`, color: COLOR_AMBER },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
}

function niceAxisValues(min: number, max: number, steps: number): number[] {
  if (min === max) {
    return [min - 1, min, min + 1]
  }
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
  for (let v = start; v <= max + niceStep * 0.5; v += niceStep) {
    values.push(v)
  }
  return values
}

// ── Chart Component ────────────────────────────────────────────────────────

export function PriceChart({
  points,
  loading = false,
}: {
  points: PricePoint[]
  loading?: boolean
}) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>("p")
  const [hover, setHover] = useState<{ x: number; idx: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const metricConfig = METRICS.find((m) => m.key === activeMetric)!

  // Compute chart dimensions
  const chartWidth = useMemo(() => {
    // Will be overridden by container width via viewBox, but we use a reference
    return 600
  }, [])

  const innerW = chartWidth - PADDING.left - PADDING.right
  const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom

  // Extract data values for the active metric
  const values = useMemo(
    () => points.map((pt) => pt[activeMetric]),
    [points, activeMetric],
  )

  // Compute Y-axis bounds with some padding
  const { yMin, yMax, yTicks } = useMemo(() => {
    if (values.length === 0) return { yMin: 0, yMax: 100, yTicks: [0, 50, 100] }
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) {
      min -= Math.abs(min * 0.01) || 1
      max += Math.abs(max * 0.01) || 1
    }
    const pad = (max - min) * 0.05
    min -= pad
    max += pad
    const ticks = niceAxisValues(min, max, 4)
    return { yMin: Math.min(min, ticks[0]), yMax: Math.max(max, ticks[ticks.length - 1]), yTicks: ticks }
  }, [values])

  // Build SVG path
  const { path, areaPath, dots } = useMemo(() => {
    if (values.length < 2) return { path: "", areaPath: "", dots: [] }

    const xScale = (i: number) => PADDING.left + (i / (values.length - 1)) * innerW
    const yScale = (v: number) => PADDING.top + (1 - (v - yMin) / (yMax - yMin)) * innerH

    const pts = values.map((v, i) => ({ x: xScale(i), y: yScale(v) }))
    const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")

    // Area fill path (line + close to bottom)
    const area =
      linePath +
      ` L ${pts[pts.length - 1].x.toFixed(1)} ${(PADDING.top + innerH).toFixed(1)}` +
      ` L ${pts[0].x.toFixed(1)} ${(PADDING.top + innerH).toFixed(1)} Z`

    return { path: linePath, areaPath: area, dots: pts }
  }, [values, yMin, yMax, innerW, innerH])

  // Mouse move handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (values.length < 2 || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const clientX = e.clientX - rect.left
      const svgX = (clientX / rect.width) * chartWidth
      const dataX = svgX - PADDING.left
      const idx = Math.round((dataX / innerW) * (values.length - 1))
      if (idx >= 0 && idx < values.length) {
        const x = PADDING.left + (idx / (values.length - 1)) * innerW
        setHover({ x, idx })
      }
    },
    [values.length, chartWidth, innerW],
  )

  const handleMouseLeave = useCallback(() => setHover(null), [])

  // Compute change stats
  const changeStr = useMemo(() => {
    if (values.length < 2) return null
    const first = values[0]
    const last = values[values.length - 1]
    const change = last - first
    const changePct = first !== 0 ? (change / first) * 100 : 0
    const sign = change >= 0 ? "+" : ""
    return {
      abs: `${sign}${metricConfig.format(change).replace("$", "")}`,
      pct: `${sign}${changePct.toFixed(2)}%`,
      positive: change >= 0,
    }
  }, [values, metricConfig])

  // Time range label
  const timeRange = useMemo(() => {
    if (points.length < 2) return ""
    const firstTime = new Date(points[0].t)
    const lastTime = new Date(points[points.length - 1].t)
    const durationMin = (lastTime.getTime() - firstTime.getTime()) / 60_000
    if (durationMin < 1) return `${Math.round(durationMin * 60)}s`
    if (durationMin < 60) return `${Math.round(durationMin)}m`
    return `${(durationMin / 60).toFixed(1)}h`
  }, [points])

  // ── Render ─────────────────────────────────────────────────────────────

  const hasData = values.length >= 2

  return (
    <div className="flex flex-col gap-0">
      {/* Metric selector + stats bar */}
      <div className="flex items-center justify-between px-1 mb-1">
        <div className="flex items-center gap-2">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setActiveMetric(m.key)}
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border transition-all select-none"
              style={{
                color: activeMetric === m.key ? m.color : COLOR_DIM,
                borderColor: activeMetric === m.key ? m.color : "transparent",
                backgroundColor: activeMetric === m.key ? `${m.color}11` : "transparent",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[9px]">
          {changeStr && (
            <>
              <span style={{ color: changeStr.positive ? COLOR_GREEN : "#ff0040" }}>
                {changeStr.pct}
              </span>
              <span className="text-[var(--terminal-dim)]">{timeRange}</span>
            </>
          )}
          <span className="text-[var(--terminal-dim)]">{points.length} pts</span>
        </div>
      </div>

      {/* Chart area */}
      <div className="relative w-full border border-[var(--terminal-border)] bg-[var(--terminal-bg)]" style={{ height: CHART_HEIGHT }}>
        {!hasData ? (
          <div className="absolute inset-0 flex items-center justify-center">
            {loading ? (
              <span className="text-[10px] text-[var(--terminal-dim)] animate-pulse">
                ACCUMULATING DATA...
              </span>
            ) : (
              <span className="text-[10px] text-[var(--terminal-dim)]">
                WAITING FOR PRICE DATA
              </span>
            )}
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            className="w-full h-full"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ cursor: "crosshair" }}
          >
            {/* Grid lines */}
            {yTicks.map((tick) => {
              const y = PADDING.top + (1 - (tick - yMin) / (yMax - yMin)) * innerH
              return (
                <g key={tick}>
                  <line
                    x1={PADDING.left}
                    x2={PADDING.left + innerW}
                    y1={y}
                    y2={y}
                    stroke={COLOR_GRID}
                    strokeDasharray="2 3"
                    strokeWidth={0.5}
                  />
                  <text
                    x={PADDING.left + innerW + 4}
                    y={y + 3}
                    fill={COLOR_DIM}
                    fontSize={8}
                    fontFamily="monospace"
                  >
                    {metricConfig.format(tick)}
                  </text>
                </g>
              )
            })}

            {/* Time labels on X axis */}
            {points.length >= 2 && [0, Math.floor(points.length / 2), points.length - 1].map((idx) => {
              const x = PADDING.left + (idx / (points.length - 1)) * innerW
              return (
                <text
                  key={idx}
                  x={x}
                  y={CHART_HEIGHT - 2}
                  fill={COLOR_DIM}
                  fontSize={7}
                  fontFamily="monospace"
                  textAnchor={idx === 0 ? "start" : idx === points.length - 1 ? "end" : "middle"}
                >
                  {formatTime(points[idx].t)}
                </text>
              )
            })}

            {/* Gradient fill under line */}
            <defs>
              <linearGradient id={`chart-gradient-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={metricConfig.color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={metricConfig.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path
              d={areaPath}
              fill={`url(#chart-gradient-${activeMetric})`}
            />

            {/* Main line */}
            <path
              d={path}
              fill="none"
              stroke={metricConfig.color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Glow line (subtle) */}
            <path
              d={path}
              fill="none"
              stroke={metricConfig.color}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.15}
            />

            {/* Latest value dot */}
            {dots.length > 0 && (
              <circle
                cx={dots[dots.length - 1].x}
                cy={dots[dots.length - 1].y}
                r={2.5}
                fill={metricConfig.color}
              >
                <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
              </circle>
            )}

            {/* Crosshair on hover */}
            {hover && hover.idx < dots.length && (
              <>
                {/* Vertical line */}
                <line
                  x1={hover.x}
                  x2={hover.x}
                  y1={PADDING.top}
                  y2={PADDING.top + innerH}
                  stroke={COLOR_CROSSHAIR}
                  strokeWidth={0.5}
                  strokeDasharray="2 2"
                />
                {/* Horizontal line */}
                <line
                  x1={PADDING.left}
                  x2={PADDING.left + innerW}
                  y1={dots[hover.idx].y}
                  y2={dots[hover.idx].y}
                  stroke={COLOR_CROSSHAIR}
                  strokeWidth={0.5}
                  strokeDasharray="2 2"
                />
                {/* Hover dot */}
                <circle
                  cx={dots[hover.idx].x}
                  cy={dots[hover.idx].y}
                  r={3}
                  fill={metricConfig.color}
                  stroke="#000"
                  strokeWidth={1}
                />
                {/* Value tooltip */}
                <rect
                  x={Math.min(dots[hover.idx].x - 40, chartWidth - PADDING.right - 85)}
                  y={Math.max(dots[hover.idx].y - 28, PADDING.top)}
                  width={80}
                  height={18}
                  rx={1}
                  fill="#0d1117"
                  stroke={COLOR_BORDER}
                  strokeWidth={0.5}
                />
                <text
                  x={Math.min(dots[hover.idx].x, chartWidth - PADDING.right - 45)}
                  y={Math.max(dots[hover.idx].y - 15, PADDING.top + 13)}
                  fill={metricConfig.color}
                  fontSize={9}
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {metricConfig.format(values[hover.idx])}
                </text>
                {/* Time tooltip at bottom */}
                <text
                  x={hover.x}
                  y={CHART_HEIGHT - 2}
                  fill={COLOR_AMBER}
                  fontSize={7}
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {formatTime(points[hover.idx].t)}
                </text>
              </>
            )}
          </svg>
        )}
      </div>
    </div>
  )
}
