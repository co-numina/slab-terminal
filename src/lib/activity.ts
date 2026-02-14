/**
 * Activity feed — synthetic event detection via slab state diffing.
 * Tracks state per-slab and merges events chronologically.
 */
import { EngineState, Account, AccountKind, ActivityEvent } from './types';

interface Snapshot {
  timestamp: string;
  lastCrankSlot: bigint;
  fundingIndexQpbE6: bigint;
  numUsedAccounts: number;
  lifetimeLiquidations: bigint;
  lifetimeForceCloses: bigint;
  accounts: Map<number, { capital: bigint; positionSize: bigint; pnl: bigint; kind: AccountKind }>;
}

const MAX_EVENTS = 200;
const MAX_SNAPSHOTS = 5;

// Per-slab snapshot history
const snapshotsPerSlab = new Map<string, Snapshot[]>();
// Unified event feed
let events: ActivityEvent[] = [];

export function recordSnapshot(
  slabLabel: string,
  engine: EngineState,
  accounts: { idx: number; account: Account }[],
): void {
  const accountMap = new Map<number, { capital: bigint; positionSize: bigint; pnl: bigint; kind: AccountKind }>();
  for (const { idx, account } of accounts) {
    accountMap.set(idx, {
      capital: account.capital,
      positionSize: account.positionSize,
      pnl: account.pnl,
      kind: account.kind,
    });
  }

  const snapshot: Snapshot = {
    timestamp: new Date().toISOString(),
    lastCrankSlot: engine.lastCrankSlot,
    fundingIndexQpbE6: engine.fundingIndexQpbE6,
    numUsedAccounts: engine.numUsedAccounts,
    lifetimeLiquidations: engine.lifetimeLiquidations,
    lifetimeForceCloses: engine.lifetimeForceCloses,
    accounts: accountMap,
  };

  const slabSnapshots = snapshotsPerSlab.get(slabLabel) || [];

  if (slabSnapshots.length > 0) {
    const prev = slabSnapshots[slabSnapshots.length - 1];
    const newEvents = diffSnapshots(slabLabel, prev, snapshot);
    events = [...newEvents, ...events].slice(0, MAX_EVENTS);
  }

  slabSnapshots.push(snapshot);
  if (slabSnapshots.length > MAX_SNAPSHOTS) {
    snapshotsPerSlab.set(slabLabel, slabSnapshots.slice(-MAX_SNAPSHOTS));
  } else {
    snapshotsPerSlab.set(slabLabel, slabSnapshots);
  }
}

function diffSnapshots(slabLabel: string, prev: Snapshot, curr: Snapshot): ActivityEvent[] {
  const newEvents: ActivityEvent[] = [];
  const now = curr.timestamp;
  const tag = `[${slabLabel}]`;

  // Crank event
  if (curr.lastCrankSlot !== prev.lastCrankSlot) {
    newEvents.push({
      timestamp: now,
      type: 'crank',
      details: `${tag} Keeper crank: slot ${prev.lastCrankSlot.toString()} → ${curr.lastCrankSlot.toString()}`,
      severity: 'normal',
    });
  }

  // Funding index change
  if (curr.fundingIndexQpbE6 !== prev.fundingIndexQpbE6) {
    const delta = curr.fundingIndexQpbE6 - prev.fundingIndexQpbE6;
    newEvents.push({
      timestamp: now,
      type: 'funding',
      details: `${tag} Funding index updated: Δ${delta > 0n ? '+' : ''}${delta.toString()} qpb·e6`,
      severity: 'normal',
    });
  }

  // Liquidation events
  const newLiqs = Number(curr.lifetimeLiquidations - prev.lifetimeLiquidations);
  if (newLiqs > 0) {
    newEvents.push({
      timestamp: now,
      type: 'liquidation',
      details: `${tag} ${newLiqs} liquidation${newLiqs > 1 ? 's' : ''} executed`,
      severity: 'critical',
    });
  }

  const newForceCloses = Number(curr.lifetimeForceCloses - prev.lifetimeForceCloses);
  if (newForceCloses > 0) {
    newEvents.push({
      timestamp: now,
      type: 'liquidation',
      details: `${tag} ${newForceCloses} force close${newForceCloses > 1 ? 's' : ''} executed`,
      severity: 'critical',
    });
  }

  // Per-account diffs
  for (const [idx, currAcct] of curr.accounts) {
    const prevAcct = prev.accounts.get(idx);

    if (!prevAcct) {
      const typeLabel = currAcct.kind === AccountKind.LP ? 'LP' : 'Trader';
      newEvents.push({
        timestamp: now,
        type: 'deposit',
        details: `${tag} New ${typeLabel} #${idx} opened with ${(Number(currAcct.capital) / 1e9).toFixed(4)} SOL`,
        severity: 'normal',
      });
      continue;
    }

    if (currAcct.positionSize !== prevAcct.positionSize) {
      const prevSize = Number(prevAcct.positionSize);
      const currSize = Number(currAcct.positionSize);
      const delta = currSize - prevSize;
      const typeLabel = currAcct.kind === AccountKind.LP ? 'LP' : 'Trader';

      newEvents.push({
        timestamp: now,
        type: 'trade',
        details: `${tag} ${typeLabel} #${idx}: position ${delta > 0 ? '+' : ''}${delta.toExponential(2)} units`,
        severity: 'normal',
      });
    }

    if (currAcct.capital !== prevAcct.capital && currAcct.positionSize === prevAcct.positionSize) {
      const delta = Number(currAcct.capital - prevAcct.capital) / 1e9;
      if (Math.abs(delta) > 0.0001) {
        newEvents.push({
          timestamp: now,
          type: delta > 0 ? 'deposit' : 'withdraw',
          details: `${tag} Account #${idx}: ${delta > 0 ? '+' : ''}${delta.toFixed(4)} SOL collateral`,
          severity: Math.abs(delta) > 1 ? 'warning' : 'normal',
        });
      }
    }
  }

  for (const [idx] of prev.accounts) {
    if (!curr.accounts.has(idx)) {
      newEvents.push({
        timestamp: now,
        type: 'liquidation',
        details: `${tag} Account #${idx} removed (liquidated or closed)`,
        severity: 'warning',
      });
    }
  }

  return newEvents;
}

export function getEvents(): ActivityEvent[] {
  return events;
}
