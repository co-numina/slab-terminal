"use client"

export function ExplorerLink({
  type,
  address,
  label,
  className = "",
}: {
  type: "address" | "tx"
  address: string
  label?: string
  className?: string
}) {
  if (!address) return null

  const url =
    type === "tx"
      ? `https://explorer.solana.com/tx/${address}?cluster=devnet`
      : `https://explorer.solana.com/address/${address}?cluster=devnet`

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-[var(--terminal-cyan)] hover:text-[var(--terminal-green)] text-[9px] opacity-40 hover:opacity-100 transition-opacity ${className}`}
      title={`View on Solana Explorer: ${address.slice(0, 8)}...`}
    >
      {label || "\u2197"}
    </a>
  )
}

export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 2) return address
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}
