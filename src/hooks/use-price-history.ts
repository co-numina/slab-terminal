import { useRef, useEffect, useMemo, useCallback } from "react"
import useSWR from "swr"
import type { SlabDetail } from "@/lib/fetcher"

// Re-export the PricePoint type for consumers
export interface PricePoint {
  /** ISO timestamp */
  t: string
  /** Price in USD */
  p: number
  /** TVL in SOL */
  tvl: number
  /** Open interest in SOL */
  oi: number
  /** Funding rate bps/hour */
  fr: number
}

interface HistoryResponse {
  address: string
  points: PricePoint[]
  count: number
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const MAX_CLIENT_POINTS = 720 // ~2 hours at 10s intervals

/**
 * Hook that provides price history for a slab.
 *
 * Combines:
 *  1. Server-side accumulated history (fetched once on mount via /api/slab/[address]/history)
 *  2. Client-side accumulation from live SWR data (appends new points in real-time)
 *
 * The result is a seamless time series that grows as you watch.
 */
export function usePriceHistory(
  slabAddress: string | null,
  liveData: SlabDetail | undefined,
) {
  // Accumulated points on the client side
  const accumulatedRef = useRef<PricePoint[]>([])
  const lastTimestampRef = useRef<string>("")
  const initializedRef = useRef<string>("") // tracks which address we initialized for

  // Fetch server-side history on mount (one-time bootstrap)
  const { data: serverHistory } = useSWR<HistoryResponse>(
    slabAddress ? `/api/slab/${slabAddress}/history` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      refreshInterval: 0, // Don't re-fetch — we accumulate locally
    },
  )

  // Reset when slab address changes
  useEffect(() => {
    if (slabAddress && slabAddress !== initializedRef.current) {
      accumulatedRef.current = []
      lastTimestampRef.current = ""
      initializedRef.current = slabAddress
    }
  }, [slabAddress])

  // Bootstrap from server history (one-time)
  useEffect(() => {
    if (
      serverHistory?.points &&
      serverHistory.points.length > 0 &&
      accumulatedRef.current.length === 0 &&
      slabAddress === initializedRef.current
    ) {
      accumulatedRef.current = [...serverHistory.points]
      lastTimestampRef.current = serverHistory.points[serverHistory.points.length - 1].t
    }
  }, [serverHistory, slabAddress])

  // Append new point from live data
  const appendPoint = useCallback((detail: SlabDetail) => {
    if (!detail.solUsdPrice || detail.solUsdPrice === 0) return
    if (detail.timestamp === lastTimestampRef.current) return // Deduplicate

    const point: PricePoint = {
      t: detail.timestamp,
      p: detail.solUsdPrice,
      tvl: detail.vaultBalanceSol,
      oi: detail.openInterestSol,
      fr: detail.fundingRate.rateBpsPerHour,
    }

    accumulatedRef.current.push(point)
    lastTimestampRef.current = detail.timestamp

    // Trim to max
    if (accumulatedRef.current.length > MAX_CLIENT_POINTS) {
      accumulatedRef.current = accumulatedRef.current.slice(-MAX_CLIENT_POINTS)
    }
  }, [])

  // Append live data whenever it changes
  useEffect(() => {
    if (liveData && slabAddress === initializedRef.current) {
      appendPoint(liveData)
    }
  }, [liveData, slabAddress, appendPoint])

  // Return a stable snapshot of the accumulated points
  // We use useMemo keyed on liveData.timestamp to trigger re-renders
  const points = useMemo(() => {
    // This dependency on liveData forces re-computation when new data arrives
    if (!liveData) return accumulatedRef.current
    return [...accumulatedRef.current]
  }, [liveData])

  return {
    points,
    loading: !serverHistory && !!slabAddress,
  }
}
