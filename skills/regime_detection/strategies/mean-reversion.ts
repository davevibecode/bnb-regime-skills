import { PriceBar, TradeSignal, StrategyConfig } from "./types";
import { rsi, bollingerBands, closesOf } from "./indicators";

/**
 * STRATEGY: Mean Reversion
 *
 * Activated by the regime classifier when regime is CHOPPY_NEUTRAL.
 * Uses Bollinger %B for the entry trigger and RSI as a confirming filter —
 * the inverse role RSI plays in the momentum strategy, where it's a brake.
 * Here, an extreme RSI reading is exactly the trigger we want.
 *
 * Logic:
 *  - Price near/above upper Bollinger Band (%B > 0.95) + RSI > 70 → SHORT
 *    (price extended above its recent range, expect reversion down)
 *  - Price near/below lower Bollinger Band (%B < 0.05) + RSI < 30 → LONG
 *    (price extended below its recent range, expect reversion up)
 *  - Price near the middle band → FLAT (no edge, nothing to revert from)
 *
 * This strategy is intentionally range-bound only. It will produce poor
 * results in a strongly trending market — which is exactly why the regime
 * classifier only activates it in CHOPPY_NEUTRAL conditions.
 */
export function meanReversionStrategy(
  bars: PriceBar[],
  config: StrategyConfig = {}
): TradeSignal {
  const lookback = config.lookbackPeriod ?? 20; // Bollinger default period
  const minStrength = config.minStrength ?? 0.15;

  if (bars.length < lookback + 1) {
    return {
      timestamp: bars[bars.length - 1]?.timestamp ?? new Date().toISOString(),
      action: "HOLD",
      strength: 0,
      rationale: `Insufficient history for Bollinger Bands (need ${lookback + 1} bars, have ${bars.length}).`,
      strategyName: "MEAN_REVERSION",
    };
  }

  const closes = closesOf(bars);
  const bands = bollingerBands(closes, lookback, 2);
  const rsiValue = rsi(closes, 14);
  const timestamp = bars[bars.length - 1].timestamp;

  if (!bands || rsiValue === null) {
    return {
      timestamp,
      action: "HOLD",
      strength: 0,
      rationale: "Indicators could not be computed — insufficient history.",
      strategyName: "MEAN_REVERSION",
    };
  }

  const { percentB, upper, lower, middle } = bands;

  let action: TradeSignal["action"] = "FLAT";
  let strength = 0;
  let rationale = `%B at ${percentB.toFixed(2)} — price within normal range, no reversion edge.`;

  const UPPER_TRIGGER = 0.95;
  const LOWER_TRIGGER = 0.05;
  const RSI_OVERBOUGHT = 70;
  const RSI_OVERSOLD = 30;

  if (percentB >= UPPER_TRIGGER) {
    // Price stretched to/above upper band — reversion-down candidate
    const bandStrength = Math.min((percentB - UPPER_TRIGGER) / (1 - UPPER_TRIGGER), 1);
    const rsiConfirms = rsiValue >= RSI_OVERBOUGHT;
    const rsiStrength = rsiConfirms
      ? Math.min((rsiValue - RSI_OVERBOUGHT) / 30, 1)
      : 0;

    // Both signals must contribute — RSI confirmation required for a real signal
    strength = rsiConfirms ? bandStrength * 0.5 + rsiStrength * 0.5 : bandStrength * 0.3;
    action = "SHORT";
    rationale = rsiConfirms
      ? `%B at ${percentB.toFixed(2)} (price near upper band ${upper.toFixed(2)}) confirmed by RSI ${rsiValue.toFixed(1)} overbought — reversion-down setup.`
      : `%B at ${percentB.toFixed(2)} stretched but RSI ${rsiValue.toFixed(1)} not yet overbought — weak unconfirmed signal.`;
  } else if (percentB <= LOWER_TRIGGER) {
    // Price stretched to/below lower band — reversion-up candidate
    const bandStrength = Math.min((LOWER_TRIGGER - percentB) / LOWER_TRIGGER, 1);
    const rsiConfirms = rsiValue <= RSI_OVERSOLD;
    const rsiStrength = rsiConfirms
      ? Math.min((RSI_OVERSOLD - rsiValue) / 30, 1)
      : 0;

    strength = rsiConfirms ? bandStrength * 0.5 + rsiStrength * 0.5 : bandStrength * 0.3;
    action = "LONG";
    rationale = rsiConfirms
      ? `%B at ${percentB.toFixed(2)} (price near lower band ${lower.toFixed(2)}) confirmed by RSI ${rsiValue.toFixed(1)} oversold — reversion-up setup.`
      : `%B at ${percentB.toFixed(2)} stretched but RSI ${rsiValue.toFixed(1)} not yet oversold — weak unconfirmed signal.`;
  } else {
    // Within normal range — distance from middle band as a soft secondary read
    const distanceFromMiddle = Math.abs(percentB - 0.5) * 2; // 0 at middle, 1 at either band
    strength = distanceFromMiddle * 0.1; // capped low — no real edge here
    action = "FLAT";
  }

  if (strength < minStrength) {
    return {
      timestamp,
      action: "FLAT",
      strength: Number(strength.toFixed(4)),
      rationale: `${rationale} Strength ${strength.toFixed(2)} below threshold ${minStrength} — staying flat.`,
      strategyName: "MEAN_REVERSION",
    };
  }

  return {
    timestamp,
    action,
    strength: Number(strength.toFixed(4)),
    rationale,
    strategyName: "MEAN_REVERSION",
  };
}
