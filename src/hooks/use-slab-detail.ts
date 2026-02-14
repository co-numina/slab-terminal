import useSWR from "swr"
import type { SlabDetail, SlabPosition, SlabLP } from "@/lib/fetcher"

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Failed to fetch: ${r.status}`)
  return r.json()
})

// Re-export types for components
export type { SlabDetail, SlabPosition, SlabLP }

interface SlabDetailOpts {
  programId?: string | null
  network?: "devnet" | "mainnet" | null
}

export function useSlabDetail(address: string | null, opts?: SlabDetailOpts) {
  // Build URL with optional hints to skip expensive program resolution
  let url: string | null = null
  if (address) {
    const params = new URLSearchParams()
    if (opts?.programId) params.set("programId", opts.programId)
    if (opts?.network) params.set("network", opts.network)
    const qs = params.toString()
    url = `/api/slab/${address}${qs ? `?${qs}` : ""}`
  }

  return useSWR<SlabDetail>(
    url,
    fetcher,
    {
      refreshInterval: 10000,
      revalidateOnFocus: false,
    },
  )
}
