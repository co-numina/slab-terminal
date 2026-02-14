import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export type HealthStatus = "active" | "stale" | "idle" | "dead"

export interface SlabRadar {
  pubkey: string
  label: string
  slabSize: number
  numUsedAccounts: number
  lastCrankSlot: number
  lastCrankAge: number
  vaultPubkey: string
  health: HealthStatus
}

export interface ProgramRadar {
  id: string
  label: string
  programId: string
  network: "devnet" | "mainnet"
  description?: string
  slabCount: number
  activeSlabCount: number
  accountCount: number
  lastCrankSlot: number
  lastCrankAge: number
  health: HealthStatus
  slabs: SlabRadar[]
  error?: string
}

export interface RadarData {
  programs: ProgramRadar[]
  totals: {
    totalPrograms: number
    totalSlabs: number
    totalActiveSlabs: number
    totalAccounts: number
    activePrograms: number
    stalePrograms: number
    idlePrograms: number
    deadPrograms: number
  }
  networks: {
    devnet: { programs: number; slabs: number; accounts: number }
    mainnet: { programs: number; slabs: number; accounts: number }
  }
  scanTimestamp: string
  scanDurationMs: number
}

export function useRadarData() {
  return useSWR<RadarData>("/api/radar", fetcher, {
    refreshInterval: 30000,
  })
}
