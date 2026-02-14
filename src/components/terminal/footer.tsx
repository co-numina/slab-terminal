export function Footer() {
  return (
    <footer className="border-t border-[var(--terminal-border)] bg-[var(--terminal-panel)] px-3 py-1.5 text-center">
      <span className="text-[10px]" style={{ color: "#3a4450" }}>
        PERCOLATOR TERMINAL v0.2 {"\u2502"} DATA: SOLANA DEVNET {"\u2502"}{" "}
        BUILT ON{" "}
        <a
          href="https://github.com/aeyakovenko/percolator"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--terminal-cyan)] hover:underline"
        >
          github.com/aeyakovenko/percolator
        </a>
        {" "}{"\u2502"}{" "}
        <a
          href="https://explorer.solana.com/address/2SSnp35m7FQ7cRLNKGdW5UzjYFF6RBUNq7d3m5mqNByp?cluster=devnet"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--terminal-cyan)] hover:underline"
        >
          PROGRAM ON EXPLORER {"\u2197"}
        </a>
        {" "}{"\u2502"} $SLAB
      </span>
    </footer>
  )
}
