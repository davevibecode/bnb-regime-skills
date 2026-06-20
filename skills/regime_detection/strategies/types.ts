/**
 * Shared types for the two sub-strategies (momentum, mean-reversion) that
 * the regime_detection Skill dispatches to.
 *
 * Both strategies consume the same OHLCV bar shape and emit the same
 * TradeSignal shape, so the backtest harness can run either one
 * interchangeably without caring which strategy produced the signal.
 */

/**
 * A single daily price bar. Sourced from CMC historical OHLCV.
 */
export interface PriceBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * The action a strategy recommends at a given point in time.
 *
 * LONG / SHORT  — open or hold a directional position
 * FLAT          — close any open position, stay in cash
 * HOLD          — no change from the current position
 */
export type TradeAction = "LONG" | "SHORT" | "FLAT" | "HOLD";

/**
 * A trade signal emitted by a sub-strategy for one bar.
 */
export interface TradeSignal {
  timestamp: string;
  action: TradeAction;
  /** 0-1 — how strongly the strategy believes in this signal */
  strength: number;
  /** Human-readable explanation, surfaced in backtest reports */
  rationale: string;
  /** The strategy that produced this signal */
  strategyName: "MOMENTUM" | "MEAN_REVERSION";
}

/**
 * Common config every sub-strategy accepts.
 */
export interface StrategyConfig {
  /** Lookback window in bars for indicator calculation */
  lookbackPeriod?: number;
  /** Minimum signal strength required to act (filters out weak signals) */
  minStrength?: number;
}

/**
 * The function signature every sub-strategy must implement.
 * Takes the full price history up to "now" and returns one signal
 * for the most recent bar — this mirrors how a live agent would call it
 * (no look-ahead: only bars [0..i] are visible when scoring bar i).
 */
export type StrategyFn = (
  bars: PriceBar[],
  config?: StrategyConfig
) => TradeSignal;
