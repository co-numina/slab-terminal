import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface LiquidationEntry {
  slabAddress: string
  program: string
  programLabel: string
  network: "devnet" | "mainnet"
  accountIndex: number
  accountId: string
  owner: string
  side: string
  size: number
  entryPrice: number
  markPrice: number
  unrealizedPnlPercent: number
  collateral: number
  health: number
  liquidationPrice: number
  distancePercent: number
  isLP: boolean
  status: string
}

export interface LiquidationsData {
  critical: LiquidationEntry[]
  warning: LiquidationEntry[]
  summary: {
    totalScanned: number
    slabsParsed: number
    totalSlabs: number
    safeAccounts: number
    criticalCount: number
    warningCount: number
    mainnetAccounts: number
    mainnetPrograms: number
  }
  generatedAt: string
}

export function useLiquidations() {
  return useSWR<LiquidationsData>("/api/liquidations", fetcher, {
    refreshInterval: 15000,
  })
}
