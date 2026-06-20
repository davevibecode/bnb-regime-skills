import axios, { AxiosInstance } from "axios";
import * as dotenv from "dotenv";
import { DerivativesSnapshot, FearGreedSnapshot, PriceSnapshot } from "./types";

dotenv.config();

const BASE_URL = process.env.CMC_BASE_URL ?? "https://pro-api.coinmarketcap.com";

/**
 * Lightweight CoinMarketCap Pro API client.
 *
 * Covers exactly the three endpoints this Skill needs:
 *  - /v5/cryptocurrency/derivatives/market-pairs/list/latest  (funding + OI)
 *  - /v3/fear-and-greed/latest + /v3/fear-and-greed/historical
 *  - /v2/cryptocurrency/quotes/latest                          (price + % change)
 *
 * If you're already wired into the CMC MCP server or CLI in your Agent,
 * you can swap this client for those calls — the regime classifier only
 * needs the three snapshot types in src/types.ts, not this specific client.
 */
export class CmcClient {
  private http: AxiosInstance;

  constructor(apiKey: string = process.env.CMC_API_KEY ?? "") {
    if (!apiKey) {
      throw new Error(
        "CMC_API_KEY is required. Get one at https://pro.coinmarketcap.com/login"
      );
    }

    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        "X-CMC_PRO_API_KEY": apiKey,
        Accept: "application/json",
      },
      timeout: 15_000,
    });
  }

  /**
   * Fetches aggregated derivatives data (funding rate, open interest) for a symbol
   * across all exchanges CMC tracks.
   *
   * Uses /v5/cryptocurrency/derivatives/market-pairs/list/latest under the hood,
   * then aggregates the per-exchange market pairs into a single volume-weighted snapshot.
   */
  async getDerivativesSnapshot(
    symbol: string,
    previousOiUsd?: number
  ): Promise<DerivativesSnapshot> {
    const res = await this.http.get(
      "/v5/cryptocurrency/derivatives/market-pairs/list/latest",
      { params: { symbol } }
    );

    const pairs: Array<{
      funding_rate?: number;
      open_interest_usd?: number;
      exchange_name?: string;
    }> = res.data?.data ?? [];

    if (pairs.length === 0) {
      throw new Error(`No derivatives market pairs found for ${symbol}`);
    }

    let weightedFundingSum = 0;
    let totalOi = 0;

    for (const pair of pairs) {
      const oi = pair.open_interest_usd ?? 0;
      const funding = pair.funding_rate ?? 0;
      weightedFundingSum += funding * oi;
      totalOi += oi;
    }

    const avgFundingRate = totalOi > 0 ? weightedFundingSum / totalOi : 0;
    const openInterestChangePct =
      previousOiUsd && previousOiUsd > 0
        ? ((totalOi - previousOiUsd) / previousOiUsd) * 100
        : 0;

    return {
      symbol,
      avgFundingRate,
      totalOpenInterestUsd: totalOi,
      openInterestChangePct,
      exchangeCount: new Set(pairs.map((p) => p.exchange_name)).size,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Fetches the current Fear & Greed Index value plus the value N days ago
   * (for trend direction) via the historical endpoint.
   */
  async getFearGreedSnapshot(lookbackDays: number = 7): Promise<FearGreedSnapshot> {
    const [latestRes, historicalRes] = await Promise.all([
      this.http.get("/v3/fear-and-greed/latest"),
      this.http.get("/v3/fear-and-greed/historical", {
        params: { limit: lookbackDays + 1 },
      }),
    ]);

    const latest = latestRes.data?.data;
    const history: Array<{ value: number; timestamp: string }> =
      historicalRes.data?.data ?? [];

    const previous =
      history.length > lookbackDays
        ? history[lookbackDays].value
        : history[history.length - 1]?.value ?? latest.value;

    return {
      value: latest.value,
      classification: latest.value_classification,
      previousValue: previous,
      timestamp: latest.update_time ?? new Date().toISOString(),
    };
  }

  /**
   * Fetches current price + % change over the lookback window, and
   * approximates realised volatility from the historical quotes series.
   */
  async getPriceSnapshot(
    symbol: string,
    lookbackDays: number = 14
  ): Promise<PriceSnapshot> {
    const quoteRes = await this.http.get("/v2/cryptocurrency/quotes/latest", {
      params: { symbol },
    });

    const quoteData = Object.values(quoteRes.data?.data ?? {})[0] as
      | { quote: { USD: { price: number; percent_change_30d?: number; percent_change_7d?: number } } }
      | undefined;

    if (!quoteData) {
      throw new Error(`No quote data found for ${symbol}`);
    }

    const priceUsd = quoteData.quote.USD.price;

    // Use 7d or 30d change depending on lookback window, fall back gracefully
    const percentChangeLookback =
      lookbackDays <= 7
        ? quoteData.quote.USD.percent_change_7d ?? 0
        : quoteData.quote.USD.percent_change_30d ?? 0;

    // Approximate realised volatility from historical OHLCV
    const historicalRes = await this.http.get(
      "/v2/cryptocurrency/ohlcv/historical",
      {
        params: {
          symbol,
          count: lookbackDays,
          interval: "daily",
        },
      }
    );

    const quotes: Array<{ quote: { USD: { close: number } } }> =
      historicalRes.data?.data?.quotes ?? [];

    const closes = quotes.map((q) => q.quote.USD.close).filter((c) => c > 0);
    const realizedVolatility = computeAnnualizedVolatility(closes);

    return {
      symbol,
      priceUsd,
      percentChangeLookback,
      realizedVolatility,
      fetchedAt: new Date().toISOString(),
    };
  }
}

/**
 * Computes annualised realised volatility from a series of daily closes.
 * Uses log returns and the standard sqrt(365) scaling convention.
 */
function computeAnnualizedVolatility(closes: number[]): number {
  if (closes.length < 2) return 0;

  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    logReturns.push(Math.log(closes[i] / closes[i - 1]));
  }

  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance =
    logReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
    (logReturns.length - 1 || 1);
  const dailyStdDev = Math.sqrt(variance);

  return dailyStdDev * Math.sqrt(365);
}
