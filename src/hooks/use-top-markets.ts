import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface TopMarket {
  slabAddress: string
  program: string
  programId: string
  network: "devnet" | "mainnet"
  collateralMint: string
  collateralSymbol: string
  price: number
  tvl: number
  tvlUsd: number
  openInterest: number
  positions: {
    longs: number
    shorts: number
    flat: number
    total: number
    active: number
  }
  worstHealth: number
  fundingRate: number
  fundingDirection: string
  lastCrankAge: number
  status: string
  config: {
    invert: number
    maintMarginBps: number
    initMarginBps: number
    tradingFeeBps: number
    maxAccounts: number
    usedAccounts: number
    utilization: number
  }
  slabSize: number
}

export interface TopMarketsData {
  markets: TopMarket[]
  count: number
  totalCandidates: number
  generatedAt: string
}

export function useTopMarkets() {
  return useSWR<TopMarketsData>("/api/top-markets?limit=15", fetcher, {
    refreshInterval: 60000,
  })
}
