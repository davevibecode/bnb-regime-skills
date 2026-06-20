import { PriceBar, TradeAction } from "../strategies/types";
import { MarketRegime, RecommendedStrategy } from "../src/types";

/**
 * A single executed (or held) position state at one bar in the backtest.
 */
export interface BacktestStep {
  timestamp: string;
  close: number;
  regime: MarketRegime;
  recommendedStrategy: RecommendedStrategy;
  action: TradeAction;
  signalStrength: number;
  /** Position size as a fraction of capital, -1 (full short) to +1 (full long) */
  positionSize: number;
  /** Equity value at this bar, after applying the day's return */
  equity: number;
  /** Return for this bar as a decimal, e.g. 0.012 = +1.2% */
  barReturn: number;
  rationale: string;
}

/**
 * A completed round-trip trade, derived from the step-by-step position changes.
 * Used for trade-level statistics (win rate, average win/loss, etc.)
 */
export interface CompletedTrade {
  entryTimestamp: string;
  exitTimestamp: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  /** Return as a decimal, e.g. 0.05 = +5% */
  returnPct: number;
  holdingPeriodBars: number;
  regimeAtEntry: MarketRegime;
}

/**
 * Aggregate performance metrics for a completed backtest run.
 */
export interface BacktestMetrics {
  totalReturnPct: number;
  /** Compound annual growth rate, assuming 365 bars/year for daily data */
  annualizedReturnPct: number;
  annualizedVolatilityPct: number;
  sharpeRatio: number;
  /** Largest peak-to-trough equity decline, as a decimal, e.g. 0.18 = -18% */
  maxDrawdownPct: number;
  maxDrawdownStart: string | null;
  maxDrawdownEnd: string | null;
  totalTrades: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  /** Gross profit / gross loss. >1 means winners outweigh losers in aggregate. */
  profitFactor: number;
  /** Breakdown of bars spent in each regime */
  regimeBreakdown: Record<MarketRegime, number>;
  /** Return contribution by regime — which regime actually made/lost money */
  returnByRegime: Record<MarketRegime, number>;
}

/**
 * Full output of a backtest run — the "backtestable strategy spec" deliverable.
 */
export interface BacktestResult {
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalEquity: number;
  steps: BacktestStep[];
  trades: CompletedTrade[];
  metrics: BacktestMetrics;
  config: BacktestConfig;
}

export interface BacktestConfig {
  symbol: string;
  initialCapital: number;
  /** Round-trip transaction cost as a decimal, e.g. 0.001 = 10bps per side */
  transactionCostPct: number;
  /** Regime re-evaluation frequency in bars. 1 = re-classify every bar. */
  regimeRefreshBars: number;
  /** Minimum bars of history required before the backtest starts trading */
  warmupBars: number;
}

export const DEFAULT_BACKTEST_CONFIG: Omit<BacktestConfig, "symbol"> = {
  initialCapital: 10_000,
  transactionCostPct: 0.001,
  regimeRefreshBars: 1,
  warmupBars: 30,
};
