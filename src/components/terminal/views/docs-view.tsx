"use client"

import { TerminalPanel } from "../terminal-panel"

// ── Section Component ───────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[var(--terminal-green)] text-[11px] font-bold uppercase tracking-wider">{"\u2588"} {title}</span>
        <span className="flex-1 border-b border-dotted border-[var(--terminal-border)]" />
      </div>
      <div className="pl-3 text-[10px] leading-relaxed text-[var(--terminal-text)] font-mono space-y-2">
        {children}
      </div>
    </div>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <span className="text-[var(--terminal-cyan)] text-[10px] font-bold uppercase">{"\u251C\u2500"} {title}</span>
      <div className="pl-3 mt-0.5 space-y-1">
        {children}
      </div>
    </div>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[var(--terminal-dim)]">{children}</p>
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-[var(--terminal-bg)] border border-[var(--terminal-border)] px-2 py-1 text-[9px] text-[var(--terminal-green)] overflow-x-auto">
      {children}
    </pre>
  )
}

function Bullet({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <span className="text-[var(--terminal-green)] shrink-0">{"\u25B8"}</span>
      <span className="text-[var(--terminal-dim)]">
        {label && <span className="text-[var(--terminal-text)] font-bold">{label}: </span>}
        {children}
      </span>
    </div>
  )
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--terminal-cyan)] hover:underline"
    >
      {children} {"\u2197"}
    </a>
  )
}

// ── Main Docs View ──────────────────────────────────────────────────────

export function DocsView() {
  return (
    <div className="flex flex-col gap-px max-w-4xl mx-auto">
      <TerminalPanel title="SLAB SCOPE — Technical Documentation">
        <div className="space-y-0">
          {/* ── Overview ──────────────────────────────────────────── */}
          <Section title="Overview">
            <P>
              SLAB SCOPE is a real-time monitoring dashboard for the Percolator perpetual futures
              ecosystem on Solana. It scans all known Percolator program deployments across devnet
              and mainnet, parses on-chain slab accounts, and presents market data through a
              Bloomberg terminal-inspired interface.
            </P>
            <P>
              The system discovers markets automatically by scanning program accounts, resolves
              token metadata via Jupiter and Metaplex, fetches USD prices from DexScreener, and
              provides drill-down views into individual slab markets with position maps, depth
              analysis, and margin health monitoring.
            </P>
          </Section>

          {/* ── What is Percolator ────────────────────────────────── */}
          <Section title="What is Percolator?">
            <P>
              Percolator is a perpetual futures protocol on Solana created by Anatoly Yakovenko
              (Toly). It enables leveraged trading of any SPL token pair with on-chain order
              matching, margin management, and automated liquidations.
            </P>

            <SubSection title="Core Concepts">
              <Bullet label="Slab">
                A single on-chain account containing an entire perpetual futures market — config,
                oracle state, all trader positions, LP positions, and engine state packed into one
                contiguous account. Sizes range from 62KB (240 accounts) to 992KB (4096 accounts).
              </Bullet>
              <Bullet label="Accounts">
                Individual position slots within a slab. Each account holds a trader or LP position
                with entry price, size, collateral, margin health, and PnL data.
              </Bullet>
              <Bullet label="Oracle">
                Price feeds that drive mark-to-market calculations. Supports Chainlink OCR2 (Pyth),
                admin-set prices, and DEX-based oracles (PumpSwap, Raydium, Meteora).
              </Bullet>
              <Bullet label="Crank">
                Periodic on-chain transactions that update oracle prices, process funding payments,
                and trigger liquidations. Crank age indicates market health.
              </Bullet>
              <Bullet label="Insurance Fund">
                Per-market fund that absorbs losses from liquidations. Ratio of insurance to open
                interest is a key health indicator.
              </Bullet>
            </SubSection>

            <SubSection title="Key Links">
              <Bullet>
                <Link href="https://github.com/aeyakovenko/percolator">
                  github.com/aeyakovenko/percolator
                </Link>
                {" "}&mdash; Original source by Toly
              </Bullet>
              <Bullet>
                <Link href="https://explorer.solana.com/address/2SSnp35m7FQ7cRLNKGdW5UzjYFF6RBUNq7d3m5mqNByp?cluster=devnet">
                  Toly OG Program on Explorer
                </Link>
              </Bullet>
            </SubSection>
          </Section>

          {/* ── Architecture ──────────────────────────────────────── */}
          <Section title="Architecture">
            <P>
              SLAB SCOPE is built as a Next.js 14 application with server-side API routes that
              perform all RPC calls and parsing, and a React frontend that polls those APIs.
            </P>

            <Code>{`
  Browser (React)          Server (Next.js API Routes)         Solana RPC
  ─────────────────        ──────────────────────────          ──────────
  useEcosystem() ────────► /api/ecosystem ──────────────────► getProgramAccounts()
  useTopMarkets() ───────► /api/top-markets ───────────────► getMultipleAccountsInfo()
  useSlabDetail() ───────► /api/slab/[address] ────────────► getAccountInfo()
                           /api/radar ──────────────────────► getProgramAccounts()
                           /api/positions ──────────────────► getAccountInfo()
                           /api/liquidations ───────────────► getAccountInfo()
                                    │
                                    ├──► DexScreener API (USD prices)
                                    ├──► Jupiter API (token symbols)
                                    └──► Metaplex (fallback metadata)
            `.trim()}</Code>

            <SubSection title="Data Flow">
              <Bullet label="Discovery">
                The radar system ({"\u2192"} <span className="text-[var(--terminal-cyan)]">src/lib/radar.ts</span>)
                scans all registered programs via getProgramAccounts with dataSlice filters. It reads
                the first 1314 bytes of each slab (config header) to extract market metadata without
                downloading full account data.
              </Bullet>
              <Bullet label="Parsing">
                The percolator parser ({"\u2192"} <span className="text-[var(--terminal-cyan)]">src/lib/percolator.ts</span>)
                decodes the binary slab format: config section (oracle, collateral mint, fee rates),
                engine state (funding rate, slot counters), and all position accounts (fixed-size
                260-byte entries).
              </Bullet>
              <Bullet label="Enrichment">
                Token symbols are resolved via Jupiter token list + Metaplex on-chain metadata.
                USD prices come from DexScreener&apos;s highest-liquidity pairs. Both are cached
                in-memory (60s for prices, permanent for symbols).
              </Bullet>
              <Bullet label="Caching">
                All API responses are cached server-side (30s for ecosystem, 5s for slab detail)
                with stale-while-revalidate headers. The radar scan result is cached and shared
                across all endpoints.
              </Bullet>
            </SubSection>
          </Section>

          {/* ── Program Registry ──────────────────────────────────── */}
          <Section title="Program Registry">
            <P>
              SLAB SCOPE monitors all known Percolator deployments. Each program is a separate
              on-chain deployment with its own slab account size tier.
            </P>

            <Code>{`
  ID              LABEL        NETWORK    SLAB SIZE     ACCOUNTS
  ─────────────── ──────────── ────────── ───────────── ────────
  toly-original   Toly OG      devnet     992,560 B     4,096
  launch-small    Launch 240   devnet      62,808 B       240
  launch-medium   Launch 960   devnet     249,480 B       960
  launch-large    Launch 4096  devnet     992,560 B     4,096
  sov-mainnet     SOV          mainnet    992,560 B     4,096
            `.trim()}</Code>

            <P>
              The Toly OG program is the original Percolator deployment with a Chainlink
              OCR2 oracle for SOL/USD. Launch programs (240/960/4096) are from the
              Percolator Launch factory, supporting arbitrary token pairs with DEX-based
              oracles. SOV is MidTermDev&apos;s mainnet deployment with the $PERC token.
            </P>
          </Section>

          {/* ── Dashboard Views ───────────────────────────────────── */}
          <Section title="Dashboard Views">
            <SubSection title="HOME">
              <P>
                Main dashboard with ecosystem overview, program health status, top markets by TVL,
                ecosystem vitals (positions, wallets), slab utilization heatmap, risk monitor,
                network breakdown (devnet vs mainnet), recent on-chain activity feed, and a market
                landscape treemap sized by TVL.
              </P>
            </SubSection>

            <SubSection title="RADAR">
              <P>
                Full ecosystem scanner showing every discovered slab across all programs and networks.
                Displays collateral token, oracle type, TVL, account utilization, crank age, and health
                status. Click any slab to drill down. Supports filtering by program and network.
              </P>
            </SubSection>

            <SubSection title="SLAB DETAIL">
              <P>
                Deep dive into a single market. Two-column market visual: position scatter plot
                (entry price vs size, color-coded long/short) and depth panel (long/short balance,
                TVL/OI/insurance bars, utilization gauge). Below: market overview (oracle price,
                funding rate, vault balance), config details, full position table with margin health
                and PnL, and LP performance metrics.
              </P>
            </SubSection>
          </Section>

          {/* ── Performance ───────────────────────────────────────── */}
          <Section title="Performance Optimizations">
            <P>
              The system is heavily optimized to minimize RPC calls and latency:
            </P>
            <Bullet label="Batch RPC">
              Uses getMultipleAccountsInfo() to fetch up to 10 accounts per call instead of
              individual getAccountInfo() per slab. Vault balances fetched in parallel batches.
            </Bullet>
            <Bullet label="Parallel Discovery">
              All programs within a network are scanned in parallel via Promise.all(). Slot
              fetches for both networks run concurrently.
            </Bullet>
            <Bullet label="Header-only Scanning">
              Radar reads only the first 1314 bytes (dataSlice) of each slab to get config data
              without downloading 62KB-992KB of position data.
            </Bullet>
            <Bullet label="Shared Radar Cache">
              A single scanEcosystem() result is cached and shared across /api/ecosystem,
              /api/top-markets, and /api/radar — avoiding redundant scans.
            </Bullet>
            <Bullet label="Stale-While-Revalidate">
              All endpoints use SWR caching patterns both server-side (in-memory) and via
              HTTP cache headers, ensuring fast responses for repeat requests.
            </Bullet>
          </Section>

          {/* ── On-Chain Data Format ──────────────────────────────── */}
          <Section title="On-Chain Slab Format">
            <P>
              Each slab account is a contiguous byte array with three sections:
            </P>

            <Code>{`
  Offset    Size      Section
  ────────  ────────  ─────────────────────────────────────────
  0         1,314 B   Config — oracle, collateral mint, fees,
                      vault authority, price caps, scaling
  1,314     40 B      Engine — funding rate accumulator,
                      net OI, slot counters, crank state
  1,354     N×260 B   Accounts — position entries (N = 240,
                      960, or 4096 depending on slab tier)

  Each Account Entry (260 bytes):
  ────────────────────────────────────────────────────────────
  owner (32B) | kind (1B) | positionSize (8B, i64) |
  entryPriceE6 (8B, u64) | capitalE6 (8B, i64) |
  realizedPnlE6 (8B, i64) | unrealizedPnlE6 (8B, i64) |
  padding + additional fields
            `.trim()}</Code>

            <P>
              Position sizes are stored as i64 in the slab&apos;s native unit scale. Negative
              values = long (in inverted markets like Toly OG), positive = short. The parser
              applies the invert flag to normalize sides for display.
            </P>
          </Section>

          {/* ── Tech Stack ────────────────────────────────────────── */}
          <Section title="Tech Stack">
            <Bullet label="Frontend">Next.js 14, React 18, Tailwind CSS, SWR</Bullet>
            <Bullet label="Backend">Next.js API Routes (serverless), Node.js</Bullet>
            <Bullet label="Blockchain">@solana/web3.js for all RPC communication</Bullet>
            <Bullet label="Prices">DexScreener API, Chainlink OCR2 oracle</Bullet>
            <Bullet label="Metadata">Jupiter Token List API, Metaplex on-chain metadata</Bullet>
            <Bullet label="Styling">Custom terminal aesthetic with CSS variables, monospace fonts, scanline CRT effects</Bullet>
            <Bullet label="Deployment">Vercel (auto-deploy on push to main)</Bullet>
          </Section>

          {/* ── File Structure ────────────────────────────────────── */}
          <Section title="Key Files">
            <Code>{`
  src/
  ├── app/
  │   ├── page.tsx                    # Main dashboard + view router
  │   └── api/
  │       ├── ecosystem/route.ts      # Aggregated ecosystem stats
  │       ├── top-markets/route.ts    # Top 15 markets by TVL
  │       ├── radar/route.ts          # Full slab discovery
  │       ├── slab/[address]/
  │       │   ├── route.ts            # Single slab detail
  │       │   └── history/route.ts    # Price history accumulator
  │       ├── positions/route.ts      # Position table data
  │       ├── liquidations/route.ts   # Liquidation risk scanner
  │       └── lps/route.ts            # LP performance data
  ├── lib/
  │   ├── percolator.ts               # Binary slab parser
  │   ├── fetcher.ts                  # RPC fetch + batch helpers
  │   ├── radar.ts                    # Ecosystem scanner
  │   ├── registry.ts                 # Program registry
  │   ├── oracle.ts                   # Chainlink price reader
  │   ├── dexscreener.ts              # USD price resolver
  │   ├── known-mints.ts              # Token symbol resolver
  │   └── connections.ts              # Multi-network RPC pool
  ├── hooks/
  │   ├── use-ecosystem.ts            # Ecosystem data hook
  │   ├── use-top-markets.ts          # Top markets hook
  │   ├── use-slab-detail.ts          # Slab detail hook
  │   └── use-navigation.tsx          # View router context
  └── components/terminal/
      ├── header.tsx                   # Logo + stats + tabs
      ├── terminal-panel.tsx           # Reusable panel wrapper
      ├── market-visual.tsx            # Position map + depth panel
      ├── views/
      │   ├── home-view.tsx            # HOME dashboard
      │   ├── radar-view.tsx           # RADAR scanner
      │   ├── slab-detail-view.tsx     # Slab drill-down
      │   └── docs-view.tsx            # This documentation
      └── home/
          ├── top-markets.tsx           # Top markets table
          ├── ecosystem-overview.tsx    # Stat cards
          ├── program-status.tsx        # Program health
          └── ...                       # Other home panels
            `.trim()}</Code>
          </Section>

          {/* ── Footer ────────────────────────────────────────────── */}
          <div className="mt-6 pt-3 border-t border-dotted border-[var(--terminal-border)]">
            <p className="text-[9px] text-[var(--terminal-dim)] text-center">
              SLAB SCOPE v1.0 {"\u2502"} Built on{" "}
              <Link href="https://github.com/aeyakovenko/percolator">Percolator</Link>
              {" "}{"\u2502"} Solana Devnet + Mainnet
            </p>
          </div>
        </div>
      </TerminalPanel>
    </div>
  )
}
