"use client"

import { useState, useCallback } from "react"
import { useCrankStatus } from "@/hooks/use-market-data"
import { ExplorerLink, truncateAddress } from "./explorer-link"

function StatusDot({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${
        on
          ? "bg-[var(--terminal-green)] animate-pulse-live"
          : "bg-[var(--terminal-dim)]"
      }`}
    />
  )
}

export function CrankControl() {
  const { data, mutate } = useCrankStatus()
  const [cranking, setCranking] = useState(false)
  const [toggling, setToggling] = useState(false)

  const handleCrankNow = useCallback(async () => {
    setCranking(true)
    try {
      await fetch("/api/crank", { method: "POST" })
      await mutate()
    } catch (err) {
      console.error("Manual crank failed:", err)
    } finally {
      setCranking(false)
    }
  }, [mutate])

  const handleToggleBot = useCallback(async () => {
    setToggling(true)
    try {
      const action = data?.running ? "stop" : "start"
      await fetch("/api/crank/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      await mutate()
    } catch (err) {
      console.error("Toggle bot failed:", err)
    } finally {
      setToggling(false)
    }
  }, [data?.running, mutate])

  const isRunning = data?.running ?? false
  const walletPubkey = data?.walletPubkey ?? ""
  const walletBalance = data?.walletBalance ?? 0
  const crankCount = data?.crankCount ?? 0
  const errorCount = data?.errorCount ?? 0
  const lastSig = data?.lastCrankSignature
  const lastError = data?.lastError
  const lowBalance = walletBalance > 0 && walletBalance < 0.1

  return (
    <div className="border border-[var(--terminal-border)] bg-[var(--terminal-panel)]">
      {/* Header row */}
      <div className="flex items-center justify-between border-b border-[var(--terminal-border)] bg-[var(--terminal-bg)] px-3 py-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--terminal-border)]">{"\u250c\u2500"}</span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--terminal-dim)]">
            Keeper Crank
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle bot button */}
          <button
            onClick={handleToggleBot}
            disabled={toggling}
            className={`flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border transition-all select-none ${
              isRunning
                ? "border-[var(--terminal-green)] text-[var(--terminal-green)] hover:bg-[var(--terminal-green)] hover:text-[var(--terminal-bg)]"
                : "border-[var(--terminal-dim)] text-[var(--terminal-dim)] hover:border-[var(--terminal-green)] hover:text-[var(--terminal-green)]"
            } ${toggling ? "opacity-50" : ""}`}
          >
            <StatusDot on={isRunning} />
            <span>{"\u26a1"}</span>
            {toggling ? "..." : isRunning ? "BOT: ON" : "BOT: OFF"}
          </button>

          {/* Manual crank button */}
          <button
            onClick={handleCrankNow}
            disabled={cranking}
            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-[var(--terminal-cyan)] text-[var(--terminal-cyan)] hover:bg-[var(--terminal-cyan)] hover:text-[var(--terminal-bg)] transition-all select-none ${
              cranking ? "opacity-50" : ""
            }`}
          >
            {cranking ? "CRANKING..." : "CRANK NOW"}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-3 py-1.5">
        {/* Wallet */}
        {walletPubkey && (
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-[var(--terminal-dim)]">WALLET</span>
            <span className="text-[var(--terminal-green)] font-mono">
              {truncateAddress(walletPubkey, 4)}
            </span>
            <ExplorerLink type="address" address={walletPubkey} />
          </div>
        )}

        {/* Balance */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-[var(--terminal-dim)]">BAL</span>
          <span
            className={`font-bold ${
              lowBalance
                ? "text-[var(--terminal-amber)]"
                : "text-[var(--terminal-green)]"
            }`}
          >
            {walletBalance.toFixed(4)} SOL
          </span>
          {lowBalance && (
            <span className="text-[var(--terminal-amber)] text-[9px]">{"\u26a0"} LOW</span>
          )}
        </div>

        {/* Crank count */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-[var(--terminal-dim)]">CRANKS</span>
          <span className="text-[var(--terminal-cyan)] font-bold">{crankCount}</span>
        </div>

        {/* Error count */}
        {errorCount > 0 && (
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-[var(--terminal-dim)]">ERRORS</span>
            <span className="text-[var(--terminal-red)] font-bold">{errorCount}</span>
          </div>
        )}

        {/* Last crank signature */}
        {lastSig && (
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-[var(--terminal-dim)]">LAST TX</span>
            <ExplorerLink type="tx" address={lastSig} label={`${lastSig.slice(0, 8)}...`} />
          </div>
        )}

        {/* Last error */}
        {lastError && (
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-[var(--terminal-red)]">
              ERR: {lastError.length > 60 ? lastError.slice(0, 60) + "..." : lastError}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
