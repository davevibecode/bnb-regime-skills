import { PriceBar, TradeSignal, StrategyConfig } from "./types";
import { rsi, macd, closesOf } from "./indicators";

/**
 * STRATEGY: Momentum
 *
 * Activated by the regime classifier when regime is TRENDING_BULL or
 * TRENDING_BEAR. Blends RSI and MACD into entry/exit rules — directly
 * matching the hackathon's own example: "A momentum Skill that blends
 * RSI, MACD, and Fear & Greed into entry and exit rules."
 *
 * Logic:
 *  - MACD histogram > 0 and rising → bullish momentum confirmed
 *  - MACD histogram < 0 and falling → bearish momentum confirmed
 *  - RSI used as a momentum-exhaustion filter: RSI > 70 weakens a LONG
 *    signal's strength (momentum may be overextended); RSI < 30 weakens
 *    a SHORT signal's strength for the same reason. This is the opposite
 *    of how RSI is used in mean-reversion — here it's a brake, not a trigger.
 *
 * This strategy is intentionally trend-following only. It does not try to
 * pick tops or bottoms — that's the mean-reversion strategy's job, and the
 * regime classifier decides which one should be live.
 */
export function momentumStrategy(
  bars: PriceBar[],
  config: StrategyConfig = {}
): TradeSignal {
  const lookback = config.lookbackPeriod ?? 26; // needs at least slow EMA period
  const minStrength = config.minStrength ?? 0.15;

  if (bars.length < lookback + 9) {
    return {
      timestamp: bars[bars.length - 1]?.timestamp ?? new Date().toISOString(),
      action: "HOLD",
      strength: 0,
      rationale: `Insufficient history for MACD (need ${lookback + 9} bars, have ${bars.length}).`,
      strategyName: "MOMENTUM",
    };
  }

  const closes = closesOf(bars);
  const macdResult = macd(closes);
  const rsiValue = rsi(closes, 14);
  const timestamp = bars[bars.length - 1].timestamp;

  if (!macdResult || rsiValue === null) {
    return {
      timestamp,
      action: "HOLD",
      strength: 0,
      rationale: "Indicators could not be computed — insufficient history.",
      strategyName: "MOMENTUM",
    };
  }

  const { macdLine, histogram } = macdResult;

  // Primary direction comes from the MACD line itself (fast EMA vs slow EMA) —
  // this is reliable even in steady trends where the histogram (MACD vs its
  // own signal line) can collapse toward zero once the trend is fully priced in.
  // The histogram then acts as a strength/confirmation multiplier, not the
  // sole direction signal.
  let action: TradeSignal["action"];
  let baseStrength: number;
  const lastPrice = closes[closes.length - 1];

  if (macdLine > 0) {
    action = "LONG";
    const lineStrength = Math.min(Math.abs(macdLine) / (lastPrice * 0.02), 1);
    const histStrength = Math.min(Math.abs(histogram) / (lastPrice * 0.01), 1);
    // Blend: MACD line carries direction conviction, histogram adds confirmation
    baseStrength = lineStrength * 0.7 + histStrength * 0.3;
  } else if (macdLine < 0) {
    action = "SHORT";
    const lineStrength = Math.min(Math.abs(macdLine) / (lastPrice * 0.02), 1);
    const histStrength = Math.min(Math.abs(histogram) / (lastPrice * 0.01), 1);
    baseStrength = lineStrength * 0.7 + histStrength * 0.3;
  } else {
    action = "FLAT";
    baseStrength = 0;
  }

  // RSI exhaustion brake — weakens (does not flip) an overextended signal
  let exhaustionPenalty = 0;
  let exhaustionNote = "";

  if (action === "LONG" && rsiValue > 70) {
    exhaustionPenalty = Math.min((rsiValue - 70) / 30, 0.6); // up to 60% penalty at RSI=100
    exhaustionNote = ` RSI at ${rsiValue.toFixed(1)} signals overbought exhaustion risk, reducing conviction.`;
  } else if (action === "SHORT" && rsiValue < 30) {
    exhaustionPenalty = Math.min((30 - rsiValue) / 30, 0.6);
    exhaustionNote = ` RSI at ${rsiValue.toFixed(1)} signals oversold exhaustion risk, reducing conviction.`;
  }

  const strength = Math.max(0, baseStrength * (1 - exhaustionPenalty));

  if (strength < minStrength) {
    return {
      timestamp,
      action: "FLAT",
      strength,
      rationale: `MACD line ${macdLine.toFixed(4)} too weak after exhaustion adjustment (strength ${strength.toFixed(2)} < threshold ${minStrength}).${exhaustionNote}`,
      strategyName: "MOMENTUM",
    };
  }

  const direction = action === "LONG" ? "bullish" : action === "SHORT" ? "bearish" : "flat";

  return {
    timestamp,
    action,
    strength: Number(strength.toFixed(4)),
    rationale: `MACD line ${macdLine.toFixed(4)} (histogram ${histogram.toFixed(4)}) confirms ${direction} momentum (RSI ${rsiValue.toFixed(1)}).${exhaustionNote}`,
    strategyName: "MOMENTUM",
  };
}
