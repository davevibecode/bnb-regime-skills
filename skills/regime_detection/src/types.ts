/**
 * Core types for the regime_detection Strategy Skill.
 *
 * This Skill classifies the current market regime for a given asset using
 * derivatives positioning (funding rate, open interest trend) combined with
 * the Fear & Greed Index, then recommends which sub-strategy should be
 * active: trend-following (momentum) or mean-reversion.
 */

/**
 * The four regimes this Skill can classify the market into.
 *
 * TRENDING_BULL   — momentum strategy should be long-biased
 * TRENDING_BEAR   — momentum strategy should be short-biased / flat
 * CHOPPY_NEUTRAL  — mean-reversion strategy preferred; momentum disabled
 * EXTREME         — both strategies disabled; risk-off / reduce exposure
 */
export type MarketRegime =
  | "TRENDING_BULL"
  | "TRENDING_BEAR"
  | "CHOPPY_NEUTRAL"
  | "EXTREME";

/**
 * Which sub-strategy the regime classifier recommends activating.
 */
export type RecommendedStrategy = "MOMENTUM" | "MEAN_REVERSION" | "RISK_OFF";

/**
 * Raw derivatives snapshot for one symbol, aggregated across exchanges.
 * Sourced from CMC's derivatives market-pairs endpoint.
 */
export interface DerivativesSnapshot {
  symbol: string;
  /** Volume-weighted average funding rate across all tracked exchanges (as a decimal, e.g. 0.0001 = 0.01%) */
  avgFundingRate: number;
  /** Total open interest in USD across all tracked exchanges */
  totalOpenInterestUsd: number;
  /** % change in open interest over the lookback window */
  openInterestChangePct: number;
  /** Number of exchanges included in the aggregate */
  exchangeCount: number;
  fetchedAt: string;
}

/**
 * Fear & Greed Index snapshot.
 */
export interface FearGreedSnapshot {
  value: number; // 0-100
  classification:
    | "Extreme Fear"
    | "Fear"
    | "Neutral"
    | "Greed"
    | "Extreme Greed";
  /** Value N days ago, for trend direction */
  previousValue: number;
  timestamp: string;
}

/**
 * Price/volatility snapshot used as the third regime input.
 */
export interface PriceSnapshot {
  symbol: string;
  priceUsd: number;
  /** % change over the lookback window */
  percentChangeLookback: number;
  /** Annualised realised volatility over the lookback window, as a decimal */
  realizedVolatility: number;
  fetchedAt: string;
}

/**
 * Input to the regime classifier — the three raw data sources combined.
 */
export interface RegimeInput {
  symbol: string;
  derivatives: DerivativesSnapshot;
  fearGreed: FearGreedSnapshot;
  price: PriceSnapshot;
}

/**
 * A single scored signal contributing to the regime decision.
 * Exposed in the output so the classification is auditable, not a black box.
 */
export interface RegimeSignal {
  name: string;
  /** Normalised score from -1 (max bearish) to +1 (max bullish) */
  score: number;
  weight: number;
  rationale: string;
}

/**
 * Full output of the regime_detection skill for one symbol.
 */
export interface RegimeClassification {
  symbol: string;
  regime: MarketRegime;
  recommendedStrategy: RecommendedStrategy;
  /** Composite score from -1 (max bearish) to +1 (max bullish) */
  compositeScore: number;
  /** 0-1 — how confident the classifier is in this regime call */
  confidence: number;
  signals: RegimeSignal[];
  inputs: RegimeInput;
  classifiedAt: string;
  /** ISO timestamp — regime should be re-evaluated after this point */
  validUntil: string;
}

/**
 * Standardised Skill error — mirrors the Pharos Skill envelope convention.
 */
export interface SkillError {
  code: string;
  message: string;
  details?: unknown;
}

export type SkillResult<T> =
  | { success: true; data: T }
  | { success: false; error: SkillError };
