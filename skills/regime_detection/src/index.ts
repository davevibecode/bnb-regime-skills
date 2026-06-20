import { CmcClient } from "./cmc-client";
import { classifyRegime } from "./classifier";
import { RegimeClassification, SkillResult } from "./types";

export interface RegimeDetectionInput {
  /** CMC symbol, e.g. "BTC", "ETH", "BNB" */
  symbol: string;
  /** Lookback window in days for price trend + volatility. Default: 14 */
  lookbackDays?: number;
  /** How many hours the resulting classification stays valid. Default: 4 */
  refreshHours?: number;
  /** Previous open interest reading (USD) to compute OI trend. Optional — omit on first run. */
  previousOpenInterestUsd?: number;
}

/**
 * SKILL: regime_detection
 *
 * Classifies the current market regime for a given symbol using:
 *  - Derivatives positioning (funding rate + open interest trend) — primary signal
 *  - Fear & Greed Index — sentiment signal
 *  - Price trend + realised volatility — confirming signal + risk gate
 *
 * Returns which sub-strategy (MOMENTUM, MEAN_REVERSION, or RISK_OFF) should
 * be active right now, with a full auditable signal breakdown.
 *
 * This is the entry point judges / agents call. It fetches live data from
 * CoinMarketCap then runs the pure classification logic in classifier.ts.
 *
 * @example
 * const result = await regimeDetection({ symbol: "BTC" });
 * if (result.success) {
 *   console.log(result.data.regime, result.data.recommendedStrategy);
 * }
 */
export async function regimeDetection(
  input: RegimeDetectionInput,
  client: CmcClient = new CmcClient()
): Promise<SkillResult<RegimeClassification>> {
  try {
    const lookbackDays = input.lookbackDays ?? 14;
    const refreshHours = input.refreshHours ?? 4;

    const [derivatives, fearGreed, price] = await Promise.all([
      client.getDerivativesSnapshot(input.symbol, input.previousOpenInterestUsd),
      client.getFearGreedSnapshot(Math.min(lookbackDays, 30)),
      client.getPriceSnapshot(input.symbol, lookbackDays),
    ]);

    const classification = classifyRegime(
      { symbol: input.symbol, derivatives, fearGreed, price },
      refreshHours
    );

    return { success: true, data: classification };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error occurred";
    return {
      success: false,
      error: {
        code: "REGIME_DETECTION_FAILED",
        message,
        details: err,
      },
    };
  }
}

// Re-export everything a consumer needs
export { classifyRegime } from "./classifier";
export { CmcClient } from "./cmc-client";
export type {
  MarketRegime,
  RecommendedStrategy,
  RegimeClassification,
  RegimeInput,
  RegimeSignal,
  DerivativesSnapshot,
  FearGreedSnapshot,
  PriceSnapshot,
  SkillResult,
  SkillError,
} from "./types";
