import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface ProgramSummary {
  id: string
  label: string
  programId: string
  network: "devnet" | "mainnet"
  description?: string
  health: "active" | "stale" | "idle" | "dead"
  slabCount: number
  activeSlabCount: number
  accountCount: number
  lastCrankAge: number
  error?: string
}

export interface EcosystemData {
  programs: {
    total: number
    active: number
    stale: number
    idle: number
    dead: number
  }
  slabs: {
    total: number
    withAccounts: number
    byNetwork: { devnet: number; mainnet: number }
  }
  accounts: {
    total: number
    byNetwork: { devnet: number; mainnet: number }
  }
  positions: {
    activeLongs: number
    activeShorts: number
    flat: number
    parsed: number
    unparsed: number
  }
  uniqueWallets: number
  tvl: Record<string, { amount: number; network: string }>
  networks: {
    devnet: { programs: number; slabs: number; accounts: number }
    mainnet: { programs: number; slabs: number; accounts: number }
  }
  programSummaries: ProgramSummary[]
  lastScan: string
  scanDurationMs: number
}

export function useEcosystem() {
  return useSWR<EcosystemData>("/api/ecosystem", fetcher, {
    refreshInterval: 30000,
  })
}
