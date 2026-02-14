```
 ▄▄▄▄▄▄▄ ▄▄▄        ▄▄▄▄   ▄▄▄▄▄▄▄
█████▀▀▀ ███      ▄██▀▀██▄ ███▀▀███▄
 ▀████▄  ███      ███  ███ ███▄▄███▀
   ▀████ ███      ███▀▀███ ███  ███▄
███████▀ ████████ ███  ███ ████████▀
```

# SLAB SCOPE

**Real-time Bloomberg terminal for the Percolator perpetual futures ecosystem on Solana.**

SLAB SCOPE scans all known Percolator program deployments across devnet and mainnet, parses on-chain slab accounts in real time, and presents market data through a terminal-inspired interface with CRT scanline effects.

> Built on [Percolator](https://github.com/aeyakovenko/percolator) by Anatoly Yakovenko (Toly)

---

## What is Percolator?

Percolator is a perpetual futures protocol on Solana. It enables leveraged trading of any SPL token pair with on-chain order matching, margin management, and automated liquidations. All market state lives in a single on-chain account called a **slab**.

**Core concepts:**

- **Slab** — A single account containing an entire perpetual futures market: config, oracle state, all trader/LP positions, and engine state packed into one contiguous byte array (62KB-992KB)
- **Accounts** — Individual position slots within a slab. Each holds a trader or LP position with entry price, size, collateral, margin health, and PnL
- **Oracle** — Price feeds for mark-to-market. Supports Chainlink OCR2, admin-set prices, and DEX-based oracles (PumpSwap, Raydium, Meteora)
- **Crank** — Periodic transactions that update oracle prices, process funding payments, and trigger liquidations
- **Insurance Fund** — Per-market fund absorbing losses from liquidations. Insurance-to-OI ratio is a key health indicator

---

## Quick Start

```bash
# Clone
git clone https://github.com/co-numina/slab-terminal.git
cd slab-terminal

# Install
npm install

# Run (no env vars required — uses public RPC defaults)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables (optional)

| Variable | Default | Description |
|---|---|---|
| `SOLANA_RPC_URL` | Helius devnet (public key) | Devnet RPC endpoint |
| `SOLANA_MAINNET_RPC_URL` | `api.mainnet-beta.solana.com` | Mainnet RPC endpoint |

For production, use a dedicated RPC provider (Helius, Triton, QuickNode) to avoid rate limits.

---

## Architecture

Next.js 14 app with server-side API routes that handle all RPC calls and binary parsing. The React frontend polls these APIs via SWR with 30s refresh intervals.

```
Browser (React)              Server (API Routes)              Solana RPC
─────────────────            ──────────────────               ──────────
useEcosystem()  ──────────►  /api/ecosystem  ──────────────►  getProgramAccounts()
useTopMarkets() ──────────►  /api/top-markets ─────────────►  getMultipleAccountsInfo()
useSlabDetail() ──────────►  /api/slab/[address] ──────────►  getAccountInfo()
                             /api/radar ────────────────────►  getProgramAccounts()
                             /api/positions ────────────────►  getAccountInfo()
                             /api/liquidations ─────────────►  getAccountInfo()
                                      │
                                      ├──►  DexScreener API (USD prices)
                                      ├──►  Jupiter API (token symbols)
                                      └──►  Metaplex (fallback metadata)
```

### Data Flow

1. **Discovery** — The radar scanner (`src/lib/radar.ts`) scans all registered programs via `getProgramAccounts` with `dataSlice` filters, reading only the first 1,314 bytes (config header) of each slab to extract market metadata without downloading full account data
2. **Parsing** — The binary parser (`src/lib/percolator.ts`) decodes the slab format: config section (oracle, collateral mint, fee rates), engine state (funding rate, slot counters), and all position accounts (fixed-size 260-byte entries)
3. **Enrichment** — Token symbols resolved via Jupiter token list + Metaplex on-chain metadata. USD prices from DexScreener's highest-liquidity pairs. Both cached in-memory (60s prices, permanent symbols)
4. **Caching** — All API responses cached server-side (30s ecosystem, 5s slab detail) with stale-while-revalidate headers. Single `scanEcosystem()` result shared across `/api/ecosystem`, `/api/top-markets`, and `/api/radar`

---

## Dashboard Views

### HOME

Main dashboard with ecosystem overview, program health status, top markets by TVL, ecosystem vitals (positions, wallets), slab utilization heatmap, risk monitor, network breakdown (devnet vs mainnet), recent on-chain activity feed, and market landscape treemap.

### RADAR

Full ecosystem scanner showing every discovered slab across all programs and networks. Displays collateral token, oracle type, TVL, account utilization, crank age, and health status. Click any slab to drill down. Filter by program and network.

### SLAB DETAIL

Deep dive into a single market. Two-column market visual: position scatter plot (entry price vs size, color-coded long/short) and depth panel (long/short balance, TVL/OI/insurance bars, utilization gauge). Below: market overview, config details, full position table with margin health and PnL, and LP performance metrics.

### DOCS

In-app technical documentation covering the full architecture, on-chain format, and program registry.

---

## Program Registry

SLAB SCOPE monitors all known Percolator deployments:

| ID | Label | Network | Program Address | Slab Size | Accounts |
|---|---|---|---|---|---|
| `toly-original` | Toly OG | devnet | `2SSnp35...NByp` | 992,560 B | 4,096 |
| `launch-small` | Launch 240 | devnet | `FxfD37s...fKrD` | 62,808 B | 240 |
| `launch-medium` | Launch 960 | devnet | `FwfBKZX...j4Qn` | 249,480 B | 960 |
| `launch-large` | Launch 4096 | devnet | `g9msRSV...dm9in` | 992,560 B | 4,096 |
| `sov-mainnet` | SOV | mainnet | `GM8zjJ8...rY24` | 992,560 B | 4,096 |

The Toly OG program is the original deployment with a Chainlink OCR2 oracle for SOL/USD. Launch programs (240/960/4096) are from the Percolator Launch factory, supporting arbitrary token pairs with DEX-based oracles. SOV is the mainnet deployment with the $PERC token.

New programs can be added in `src/lib/registry.ts`.

---

## On-Chain Slab Format

Each slab account is a contiguous byte array:

```
Offset    Size       Section
────────  ─────────  ──────────────────────────────────────────
0         1,314 B    Config — oracle, collateral mint, fees,
                     vault authority, price caps, scaling
1,314     40 B       Engine — funding rate accumulator,
                     net OI, slot counters, crank state
1,354     N×260 B    Accounts — position entries (N = 240,
                     960, or 4096 depending on slab tier)
```

**Account Entry (260 bytes):**

```
owner (32B) | kind (1B) | positionSize (8B, i64) |
entryPriceE6 (8B, u64) | capitalE6 (8B, i64) |
realizedPnlE6 (8B, i64) | unrealizedPnlE6 (8B, i64) |
padding + additional fields
```

Position sizes are stored as `i64` in the slab's native unit scale. Negative values = long (in inverted markets like Toly OG), positive = short. The parser applies the invert flag to normalize sides for display.

The magic bytes `PERCOLAT` (`0x504552434f4c4154`) identify valid slab accounts.

---

## API Endpoints

All endpoints return JSON. CORS enabled for all origins.

| Endpoint | Cache | Description |
|---|---|---|
| `GET /api/ecosystem` | 30s | Aggregated ecosystem stats for HOME view |
| `GET /api/top-markets` | 30s | Top 15 markets sorted by TVL |
| `GET /api/radar` | 30s | Full slab discovery across all programs |
| `GET /api/slab/[address]` | 5s | Single slab detail with full position data |
| `GET /api/slab/[address]/history` | 5s | Price history accumulator |
| `GET /api/positions?slab=[address]` | 10s | Position table data |
| `GET /api/lps?slab=[address]` | 15s | LP performance data |
| `GET /api/liquidations?slab=[address]` | 10s | Liquidation risk scanner |
| `GET /api/activity` | 10s | Recent on-chain activity feed |
| `GET /api/crank` | — | Crank event data |
| `GET /api/market` | 5s | Market data |

---

## Performance Optimizations

- **Batch RPC** — Uses `getMultipleAccountsInfo()` to fetch up to 10 accounts per call instead of individual `getAccountInfo()` per slab. Vault balances fetched in parallel batches
- **Parallel Discovery** — All programs within a network scanned in parallel via `Promise.all()`. Slot fetches for both networks run concurrently
- **Header-only Scanning** — Radar reads only the first 1,314 bytes (`dataSlice`) of each slab to get config data without downloading 62KB-992KB of position data
- **Shared Radar Cache** — Single `scanEcosystem()` result cached and shared across `/api/ecosystem`, `/api/top-markets`, and `/api/radar` — no redundant scans
- **Stale-While-Revalidate** — All endpoints use SWR caching both server-side (in-memory) and via HTTP cache headers
- **Token Symbol Resolution** — Hierarchical resolution: hardcoded map > in-memory cache > Jupiter API > Metaplex on-chain metadata > truncated address fallback

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Next.js 16, Tailwind CSS, SWR |
| Backend | Next.js API Routes (serverless), Node.js |
| Blockchain | @solana/web3.js, @solana/spl-token |
| Prices | DexScreener API, Chainlink OCR2 oracle |
| Metadata | Jupiter Token List API, Metaplex on-chain |
| Styling | Custom terminal aesthetic with CSS variables, JetBrains Mono, scanline CRT effects |
| Deployment | Vercel (auto-deploy on push to main) |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                      # Main dashboard + view router
│   ├── layout.tsx                    # Root layout + fonts
│   └── api/
│       ├── ecosystem/route.ts        # Aggregated ecosystem stats
│       ├── top-markets/route.ts      # Top 15 markets by TVL
│       ├── radar/route.ts            # Full slab discovery
│       ├── slab/[address]/
│       │   ├── route.ts              # Single slab detail
│       │   └── history/route.ts      # Price history accumulator
│       ├── positions/route.ts        # Position table data
│       ├── liquidations/route.ts     # Liquidation risk scanner
│       ├── lps/route.ts              # LP performance data
│       ├── activity/route.ts         # On-chain activity feed
│       ├── crank/route.ts            # Crank events
│       └── market/route.ts           # Market data
├── lib/
│   ├── percolator.ts                 # Binary slab parser (491 lines)
│   ├── fetcher.ts                    # RPC fetch + batch helpers
│   ├── radar.ts                      # Ecosystem scanner
│   ├── registry.ts                   # Program registry (5 deployments)
│   ├── oracle.ts                     # Chainlink OCR2 price reader
│   ├── dexscreener.ts                # USD price resolver (60s cache)
│   ├── known-mints.ts                # Token symbol resolver
│   ├── connections.ts                # Multi-network RPC pool
│   ├── constants.ts                  # Pubkeys + cache durations
│   └── types.ts                      # TypeScript type definitions
├── hooks/
│   ├── use-ecosystem.ts              # Ecosystem data hook (30s SWR)
│   ├── use-top-markets.ts            # Top markets hook
│   ├── use-slab-detail.ts            # Slab detail hook (5s SWR)
│   └── use-navigation.tsx            # View router context
└── components/terminal/
    ├── header.tsx                     # ASCII logo + stats bar + tabs
    ├── terminal-panel.tsx             # Reusable panel wrapper
    ├── market-visual.tsx              # Position scatter + depth panel
    ├── footer.tsx                     # Footer links
    ├── views/
    │   ├── home-view.tsx              # HOME dashboard
    │   ├── radar-view.tsx             # RADAR scanner
    │   ├── slab-detail-view.tsx       # Slab drill-down
    │   └── docs-view.tsx              # In-app documentation
    └── home/
        ├── top-markets.tsx            # Top markets table
        ├── ecosystem-overview.tsx     # Stat cards
        ├── program-status.tsx         # Program health
        └── ...                        # Other home panels
```

---

## Scripts

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint
```

---

## Adding a New Program

1. Add an entry to `src/lib/registry.ts`:

```typescript
{
  id: 'my-program',
  label: 'My Program',
  programId: 'YourProgramPublicKeyHere',
  network: 'devnet',       // or 'mainnet'
  slabSize: 62_808,        // 240 accounts
  accountsPerSlab: 240,
}
```

2. The radar scanner will automatically discover all slabs owned by the program on the next scan cycle (30s).

---

## Deployment

Deployed on [Vercel](https://vercel.com) with auto-deploy on push to `main`.

For self-hosting:

```bash
npm run build
npm run start
```

Set `SOLANA_RPC_URL` and `SOLANA_MAINNET_RPC_URL` environment variables for production RPC endpoints.

---

## License

Built on [Percolator](https://github.com/aeyakovenko/percolator) by Anatoly Yakovenko.
