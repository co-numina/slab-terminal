// ============================================================================
// Slab types — ported from percolator-cli/src/solana/slab.ts
// ============================================================================

import { PublicKey } from '@solana/web3.js';

export interface SlabHeader {
  magic: bigint;
  version: number;
  bump: number;
  flags: number;
  resolved: boolean;
  admin: PublicKey;
  nonce: bigint;
  lastThrUpdateSlot: bigint;
}

export interface MarketConfig {
  collateralMint: PublicKey;
  vaultPubkey: PublicKey;
  indexFeedId: PublicKey;
  maxStalenessSlots: bigint;
  confFilterBps: number;
  vaultAuthorityBump: number;
  invert: number;
  unitScale: number;
  fundingHorizonSlots: bigint;
  fundingKBps: bigint;
  fundingInvScaleNotionalE6: bigint;
  fundingMaxPremiumBps: bigint;
  fundingMaxBpsPerSlot: bigint;
  threshFloor: bigint;
  threshRiskBps: bigint;
  threshUpdateIntervalSlots: bigint;
  threshStepBps: bigint;
  threshAlphaBps: bigint;
  threshMin: bigint;
  threshMax: bigint;
  threshMinStep: bigint;
  oracleAuthority: PublicKey;
  authorityPriceE6: bigint;
  authorityTimestamp: bigint;
  oraclePriceCapE2bps: bigint;
  lastEffectivePriceE6: bigint;
}

export interface InsuranceFund {
  balance: bigint;
  feeRevenue: bigint;
}

export interface RiskParams {
  warmupPeriodSlots: bigint;
  maintenanceMarginBps: bigint;
  initialMarginBps: bigint;
  tradingFeeBps: bigint;
  maxAccounts: bigint;
  newAccountFee: bigint;
  riskReductionThreshold: bigint;
  maintenanceFeePerSlot: bigint;
  maxCrankStalenessSlots: bigint;
  liquidationFeeBps: bigint;
  liquidationFeeCap: bigint;
  liquidationBufferBps: bigint;
  minLiquidationAbs: bigint;
}

export interface EngineState {
  vault: bigint;
  insuranceFund: InsuranceFund;
  currentSlot: bigint;
  fundingIndexQpbE6: bigint;
  lastFundingSlot: bigint;
  fundingRateBpsPerSlotLast: bigint;
  lastCrankSlot: bigint;
  maxCrankStalenessSlots: bigint;
  totalOpenInterest: bigint;
  cTot: bigint;
  pnlPosTot: bigint;
  liqCursor: number;
  gcCursor: number;
  lastSweepStartSlot: bigint;
  lastSweepCompleteSlot: bigint;
  crankCursor: number;
  sweepStartIdx: number;
  lifetimeLiquidations: bigint;
  lifetimeForceCloses: bigint;
  netLpPos: bigint;
  lpSumAbs: bigint;
  lpMaxAbs: bigint;
  lpMaxAbsSweep: bigint;
  numUsedAccounts: number;
  nextAccountId: bigint;
}

export enum AccountKind {
  User = 0,
  LP = 1,
}

export interface Account {
  kind: AccountKind;
  accountId: bigint;
  capital: bigint;
  pnl: bigint;
  reservedPnl: bigint;
  warmupStartedAtSlot: bigint;
  warmupSlopePerStep: bigint;
  positionSize: bigint;
  entryPrice: bigint;
  fundingIndex: bigint;
  matcherProgram: PublicKey;
  matcherContext: PublicKey;
  owner: PublicKey;
  feeCredits: bigint;
  lastFeeSlot: bigint;
}

// ============================================================================
// API response types
// ============================================================================

export interface MarketResponse {
  oraclePrice: number;
  oraclePriceRaw: string;
  invertedMarket: boolean;
  slot: number;
  lastCrankSlot: number;
  tvl: number;
  insuranceFund: number;
  insuranceFeeRevenue: number;
  openInterest: number;
  openInterestUnits: string;
  fundingRate: number;
  fundingRateBpsPerSlot: number;
  fundingRateBpsPerHour: number;
  fundingRateDirection: 'longs_pay' | 'shorts_pay' | 'neutral';
  maintenanceMarginBps: number;
  initialMarginBps: number;
  tradingFeeBps: number;
  liquidationFeeBps: number;
  numAccounts: number;
  numSlabs: number;
  lifetimeLiquidations: number;
  lifetimeForceCloses: number;
  lastEffectivePriceE6: string;
  timestamp: string;
}

export interface PositionEntry {
  accountIndex: number;
  slabPubkey: string;
  slabLabel: string;
  accountId: string;
  owner: string;
  side: 'long' | 'short' | 'flat';
  size: number;
  rawSize: string;
  entryPrice: number;
  entryPriceE6: string;
  markPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  unrealizedPnlPercent: number;
  collateral: number;
  effectiveCapital: number;
  marginHealth: number;
  marginRatioBps: number;
  liquidationPrice: number;
  isLP: boolean;
  status: 'safe' | 'at_risk' | 'liquidatable';
}

export interface PositionsResponse {
  positions: PositionEntry[];
  count: number;
  summary: {
    totalLongs: number;
    totalShorts: number;
    totalLongNotional: number;
    totalShortNotional: number;
    liquidatable: number;
    atRisk: number;
  };
  timestamp: string;
}

export interface LPEntry {
  index: number;
  type: 'passive' | 'vamm';
  label: string;
  slabPubkey: string;
  slabLabel: string;
  collateral: number;
  pnl: number;
  effectiveCapital: number;
  positionSize: string;
  positionNotional: number;
  spreadBps: number;
  tradingFeeBps: number;
  impactKBps: number | null;
  maxTotalBps: number;
  inventory: number;
  maxInventory: number;
  utilization: number;
  lastExecPrice: number;
  lastOraclePrice: number;
  liquidityNotional: number;
}

export interface LPsResponse {
  lps: LPEntry[];
  timestamp: string;
}

export interface ActivityEvent {
  timestamp: string;
  type: 'trade' | 'crank' | 'funding' | 'deposit' | 'withdraw' | 'liquidation' | 'info';
  details: string;
  severity: 'normal' | 'warning' | 'critical';
}

export interface ActivityResponse {
  events: ActivityEvent[];
  timestamp: string;
}
