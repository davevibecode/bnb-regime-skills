import {
  RegimeInput,
  RegimeSignal,
  RegimeClassification,
  MarketRegime,
  RecommendedStrategy,
} from "./types";

/**
 * SIGNAL WEIGHTS
 *
 * These three signals combine into the composite regime score.
 * Weights sum to 1.0. Tuned so that derivatives positioning (the
 * track's specific theme — "regime-detection Skill that switches
 * strategy based on derivatives positioning") carries the most weight,
 * with sentiment and price trend as confirming/dissenting signals.
 */
const WEIGHTS = {
  funding: 0.40,
  openInterestTrend: 0.20,
  fearGreed: 0.20,
  priceTrend: 0.20,
} as const;

/** Funding rate thresholds, expressed as decimals (0.0001 = 0.01% per 8h, the typical perp funding interval) */
const FUNDING_EXTREME_HIGH = 0.001; // crowded long, bearish mean-reversion signal
const FUNDING_EXTREME_LOW = -0.001; // crowded short, bullish mean-reversion signal

/** Realised volatility threshold (annualised) above which we consider the market in an EXTREME regime */
const EXTREME_VOLATILITY_THRESHOLD = 1.20; // 120% annualised

/** Composite score thresholds for regime classification */
const TRENDING_THRESHOLD = 0.35;

/**
 * Scores the funding rate signal.
 *
 * Logic: persistently high positive funding means longs are paying shorts —
 * the market is crowded long, which is actually a CONTRARIAN bearish signal
 * when extreme, but a confirming bullish signal when moderate and rising.
 * This is the classic "funding rate as positioning" read used by derivatives desks.
 */
function scoreFundingRate(avgFundingRate: number): RegimeSignal {
  let score: number;
  let rationale: string;

  if (avgFundingRate >= FUNDING_EXTREME_HIGH) {
    // Crowded long — contrarian bearish lean, but capped (it's a warning, not a reversal call)
    score = -0.5;
    rationale = `Funding rate ${(avgFundingRate * 100).toFixed(3)}% is extremely positive — market is crowded long, raising risk of a long squeeze.`;
  } else if (avgFundingRate <= FUNDING_EXTREME_LOW) {
    score = 0.5;
    rationale = `Funding rate ${(avgFundingRate * 100).toFixed(3)}% is extremely negative — market is crowded short, raising risk of a short squeeze.`;
  } else {
    // Moderate funding — directionally confirming, scaled linearly
    score = clamp(avgFundingRate / FUNDING_EXTREME_HIGH, -1, 1);
    rationale = `Funding rate ${(avgFundingRate * 100).toFixed(3)}% is within normal range — ${score > 0 ? "mild long bias" : score < 0 ? "mild short bias" : "neutral"}.`;
  }

  return { name: "funding_rate", score, weight: WEIGHTS.funding, rationale };
}

/**
 * Scores the open interest trend signal.
 *
 * Logic: rising OI + rising price = healthy trend (new money entering longs).
 * Rising OI + falling price = healthy downtrend (new money entering shorts).
 * Falling OI = positions closing, regardless of direction — weakening conviction.
 */
function scoreOpenInterestTrend(
  oiChangePct: number,
  priceChangePct: number
): RegimeSignal {
  let score: number;
  let rationale: string;

  const oiRising = oiChangePct > 5;
  const oiFalling = oiChangePct < -5;
  const priceRising = priceChangePct > 0;

  if (oiRising && priceRising) {
    score = 0.8;
    rationale = `Open interest up ${oiChangePct.toFixed(1)}% alongside rising price — new capital confirming an uptrend.`;
  } else if (oiRising && !priceRising) {
    score = -0.8;
    rationale = `Open interest up ${oiChangePct.toFixed(1)}% alongside falling price — new capital confirming a downtrend.`;
  } else if (oiFalling) {
    score = 0;
    rationale = `Open interest down ${oiChangePct.toFixed(1)}% — positions unwinding, weak conviction either direction.`;
  } else {
    score = clamp(priceChangePct / 10, -0.3, 0.3);
    rationale = `Open interest roughly flat (${oiChangePct.toFixed(1)}%) — no strong positioning signal.`;
  }

  return { name: "open_interest_trend", score, weight: WEIGHTS.openInterestTrend, rationale };
}

/**
 * Scores the Fear & Greed signal.
 *
 * Logic: used as a contrarian-leaning sentiment signal at extremes
 * (Extreme Fear = oversold bounce risk; Extreme Greed = overbought pullback risk),
 * but trend-confirming in the middle range.
 */
function scoreFearGreed(value: number, previousValue: number): RegimeSignal {
  let score: number;
  let rationale: string;

  if (value <= 20) {
    score = 0.3; // contrarian bullish lean at extreme fear
    rationale = `Fear & Greed at ${value} (Extreme Fear) — contrarian signal favouring mean-reversion long bias.`;
  } else if (value >= 80) {
    score = -0.3; // contrarian bearish lean at extreme greed
    rationale = `Fear & Greed at ${value} (Extreme Greed) — contrarian signal favouring mean-reversion short bias / caution.`;
  } else {
    // Middle range — trend-confirming based on direction of change
    const delta = value - previousValue;
    score = clamp(delta / 20, -0.5, 0.5);
    rationale = `Fear & Greed at ${value}, moved ${delta >= 0 ? "+" : ""}${delta} — ${delta > 0 ? "improving sentiment" : delta < 0 ? "deteriorating sentiment" : "stable sentiment"}.`;
  }

  return { name: "fear_greed", score, weight: WEIGHTS.fearGreed, rationale };
}

/**
 * Scores the raw price trend signal over the lookback window.
 */
function scorePriceTrend(percentChange: number): RegimeSignal {
  const score = clamp(percentChange / 20, -1, 1); // ±20% over lookback = max score
  const rationale = `Price moved ${percentChange >= 0 ? "+" : ""}${percentChange.toFixed(1)}% over the lookback window.`;
  return { name: "price_trend", score, weight: WEIGHTS.priceTrend, rationale };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Maps a composite score + volatility reading to a discrete MarketRegime
 * and the RecommendedStrategy that should be active under that regime.
 */
function deriveRegime(
  compositeScore: number,
  realizedVolatility: number
): { regime: MarketRegime; strategy: RecommendedStrategy } {
  if (realizedVolatility >= EXTREME_VOLATILITY_THRESHOLD) {
    return { regime: "EXTREME", strategy: "RISK_OFF" };
  }

  if (compositeScore >= TRENDING_THRESHOLD) {
    return { regime: "TRENDING_BULL", strategy: "MOMENTUM" };
  }

  if (compositeScore <= -TRENDING_THRESHOLD) {
    return { regime: "TRENDING_BEAR", strategy: "MOMENTUM" };
  }

  return { regime: "CHOPPY_NEUTRAL", strategy: "MEAN_REVERSION" };
}

/**
 * Confidence is derived from how far the composite score sits from zero
 * (stronger conviction = signals agree and are extreme) and from signal
 * agreement (low variance across the four signal scores = higher confidence).
 */
function computeConfidence(signals: RegimeSignal[], compositeScore: number): number {
  const scores = signals.map((s) => s.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  const agreement = clamp(1 - variance, 0, 1); // low variance → high agreement

  const magnitude = clamp(Math.abs(compositeScore), 0, 1);

  // Blend: 60% magnitude of the call, 40% how much the signals agree
  return clamp(magnitude * 0.6 + agreement * 0.4, 0, 1);
}

/**
 * CORE SKILL FUNCTION: classifyRegime
 *
 * Takes raw market inputs (derivatives, sentiment, price) for a symbol and
 * returns a full regime classification with an auditable signal breakdown,
 * a recommended sub-strategy, and a validity window.
 */
export function classifyRegime(
  input: RegimeInput,
  refreshHours: number = 4
): RegimeClassification {
  const { symbol, derivatives, fearGreed, price } = input;

  const signals: RegimeSignal[] = [
    scoreFundingRate(derivatives.avgFundingRate),
    scoreOpenInterestTrend(derivatives.openInterestChangePct, price.percentChangeLookback),
    scoreFearGreed(fearGreed.value, fearGreed.previousValue),
    scorePriceTrend(price.percentChangeLookback),
  ];

  const compositeScore = signals.reduce(
    (sum, s) => sum + s.score * s.weight,
    0
  );

  const { regime, strategy } = deriveRegime(compositeScore, price.realizedVolatility);
  const confidence = computeConfidence(signals, compositeScore);

  const now = new Date();
  const validUntil = new Date(now.getTime() + refreshHours * 60 * 60 * 1000);

  return {
    symbol,
    regime,
    recommendedStrategy: strategy,
    compositeScore: Number(compositeScore.toFixed(4)),
    confidence: Number(confidence.toFixed(4)),
    signals,
    inputs: input,
    classifiedAt: now.toISOString(),
    validUntil: validUntil.toISOString(),
  };
}
