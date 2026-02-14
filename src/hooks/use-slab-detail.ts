import useSWR from "swr"
import type { SlabDetail, SlabPosition, SlabLP } from "@/lib/fetcher"

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Failed to fetch: ${r.status}`)
  return r.json()
})

// Re-export types for components
export type { SlabDetail, SlabPosition, SlabLP }

export function useSlabDetail(address: string | null) {
  return useSWR<SlabDetail>(
    address ? `/api/slab/${address}` : null,
    fetcher,
    {
      refreshInterval: 10000,
      revalidateOnFocus: false,
    },
  )
}
