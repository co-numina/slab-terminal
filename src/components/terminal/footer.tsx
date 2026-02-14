export function Footer() {
  return (
    <footer className="border-t border-[var(--terminal-border)] bg-[var(--terminal-panel)] px-3 py-1.5 text-center">
      <span className="text-[10px]" style={{ color: "#3a4450" }}>
        PERCOLATOR TERMINAL v0.1 {"\u2502"} DATA: SOLANA DEVNET {"\u2502"}{" "}
        BUILT ON{" "}
        <a
          href="https://github.com/aeyakovenko/percolator"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--terminal-cyan)] hover:underline"
        >
          github.com/aeyakovenko/percolator
        </a>
        {" "}{"\u2502"} $SLAB
      </span>
    </footer>
  )
}
