import { RecommendedStrategy } from "../src/types";
import { PriceBar, TradeSignal, StrategyConfig } from "./types";
import { momentumStrategy } from "./momentum";
import { meanReversionStrategy } from "./mean-reversion";

/**
 * dispatchStrategy
 *
 * Takes the RecommendedStrategy from the regime classifier and runs the
 * matching sub-strategy against the price bars. This is the composability
 * seam: regime_detection decides WHICH strategy should be active, and this
 * function is the only place that decision turns into an actual trade signal.
 *
 * RISK_OFF short-circuits before either strategy runs — in an EXTREME
 * regime, no sub-strategy is trusted regardless of what its own indicators say.
 */
export function dispatchStrategy(
  recommendedStrategy: RecommendedStrategy,
  bars: PriceBar[],
  config?: StrategyConfig
): TradeSignal {
  if (recommendedStrategy === "RISK_OFF") {
    return {
      timestamp: bars[bars.length - 1]?.timestamp ?? new Date().toISOString(),
      action: "FLAT",
      strength: 1,
      rationale: "Regime classifier flagged RISK_OFF (extreme volatility) — forcing flat regardless of indicator state.",
      strategyName: "MOMENTUM", // nominal — RISK_OFF overrides both strategies identically
    };
  }

  if (recommendedStrategy === "MOMENTUM") {
    return momentumStrategy(bars, config);
  }

  return meanReversionStrategy(bars, config);
}

export { momentumStrategy } from "./momentum";
export { meanReversionStrategy } from "./mean-reversion";
export * from "./types";
export * from "./indicators";
