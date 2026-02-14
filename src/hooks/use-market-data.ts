import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface MarketData {
  oraclePrice: number
  priceChange24h?: number
  slot: number
  lastCrankSlot: number
  tvl: number
  insuranceFund: number
  openInterest: number
  fundingRate: number
  fundingRateDirection: string
  maintenanceMarginBps: number
  initialMarginBps: number
  tradingFeeBps: number
}

export interface Position {
  accountIndex: number
  side: "long" | "short" | "flat"
  size: number
  entryPrice: number
  markPrice: number
  unrealizedPnl: number
  unrealizedPnlPercent: number
  collateral: number
  marginHealth: number
  liquidationPrice: number
  isLP?: boolean
  status?: string
}

export interface LP {
  index: number
  type: string
  label: string
  collateral: number
  spreadBps: number
  tradingFeeBps: number
  impactKBps?: number | null
  inventory: number
  maxInventory: number
  utilization: number
  lastExecPrice: number
  lastOraclePrice: number
  liquidityNotional?: number
}

export interface ActivityEvent {
  timestamp: string
  type: "trade" | "crank" | "funding" | "deposit" | "withdraw" | "liquidation" | "info"
  details: string
  severity?: string
}

export function useMarketData() {
  return useSWR<MarketData>("/api/market", fetcher, {
    refreshInterval: 5000,
  })
}

export function usePositions() {
  return useSWR<{ positions: Position[] }>("/api/positions", fetcher, {
    refreshInterval: 10000,
  })
}

export function useLPs() {
  return useSWR<{ lps: LP[] }>("/api/lps", fetcher, {
    refreshInterval: 15000,
  })
}

export function useActivity() {
  return useSWR<{ events: ActivityEvent[] }>("/api/activity", fetcher, {
    refreshInterval: 5000,
  })
}
