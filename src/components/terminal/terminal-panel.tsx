"use client"

interface TerminalPanelProps {
  title: string
  children: React.ReactNode
  className?: string
  stale?: boolean
}

export function TerminalPanel({
  title,
  children,
  className = "",
  stale = false,
}: TerminalPanelProps) {
  return (
    <div
      className={`border border-[var(--terminal-border)] bg-[var(--terminal-panel)] flex flex-col ${className}`}
    >
      <div className="flex items-center border-b border-[var(--terminal-border)] bg-[var(--terminal-bg)] px-0 py-0">
        <span className="px-1 py-0.5 text-[10px] text-[var(--terminal-border)]">{"\u250c\u2500"}</span>
        <span className="flex-1 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[var(--terminal-dim)]">
          {title}
          {stale && (
            <span className="ml-2 text-[9px] text-[var(--terminal-amber)]">STALE</span>
          )}
        </span>
        <span className="px-1 py-0.5 text-[10px] text-[var(--terminal-border)]">{"\u2500\u2510"}</span>
      </div>
      <div className="flex-1 px-2 py-1.5">{children}</div>
    </div>
  )
}
