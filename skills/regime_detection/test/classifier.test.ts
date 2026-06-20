import { classifyRegime } from "../src/classifier";
import { RegimeInput } from "../src/types";

function buildInput(overrides: Partial<{
  avgFundingRate: number;
  openInterestChangePct: number;
  fearGreedValue: number;
  fearGreedPrevious: number;
  percentChangeLookback: number;
  realizedVolatility: number;
}> = {}): RegimeInput {
  const o = {
    avgFundingRate: 0.0001,
    openInterestChangePct: 2,
    fearGreedValue: 50,
    fearGreedPrevious: 48,
    percentChangeLookback: 1,
    realizedVolatility: 0.5,
    ...overrides,
  };

  return {
    symbol: "BTC",
    derivatives: {
      symbol: "BTC",
      avgFundingRate: o.avgFundingRate,
      totalOpenInterestUsd: 1_000_000_000,
      openInterestChangePct: o.openInterestChangePct,
      exchangeCount: 5,
      fetchedAt: new Date().toISOString(),
    },
    fearGreed: {
      value: o.fearGreedValue,
      classification: "Neutral",
      previousValue: o.fearGreedPrevious,
      timestamp: new Date().toISOString(),
    },
    price: {
      symbol: "BTC",
      priceUsd: 65000,
      percentChangeLookback: o.percentChangeLookback,
      realizedVolatility: o.realizedVolatility,
      fetchedAt: new Date().toISOString(),
    },
  };
}

describe("classifyRegime", () => {
  describe("TRENDING_BULL classification", () => {
    it("should classify a strong bullish setup as TRENDING_BULL with MOMENTUM", () => {
      const input = buildInput({
        avgFundingRate: 0.0003,
        openInterestChangePct: 15,
        fearGreedValue: 65,
        fearGreedPrevious: 50,
        percentChangeLookback: 18,
        realizedVolatility: 0.4,
      });

      const result = classifyRegime(input);

      expect(result.regime).toBe("TRENDING_BULL");
      expect(result.recommendedStrategy).toBe("MOMENTUM");
      expect(result.compositeScore).toBeGreaterThan(0);
    });
  });

  describe("TRENDING_BEAR classification", () => {
    it("should classify a strong bearish setup as TRENDING_BEAR with MOMENTUM", () => {
      const input = buildInput({
        avgFundingRate: -0.0003,
        openInterestChangePct: 15,
        fearGreedValue: 25,
        fearGreedPrevious: 40,
        percentChangeLookback: -18,
        realizedVolatility: 0.4,
      });

      const result = classifyRegime(input);

      expect(result.regime).toBe("TRENDING_BEAR");
      expect(result.recommendedStrategy).toBe("MOMENTUM");
      expect(result.compositeScore).toBeLessThan(0);
    });
  });

  describe("CHOPPY_NEUTRAL classification", () => {
    it("should classify a flat, low-conviction setup as CHOPPY_NEUTRAL with MEAN_REVERSION", () => {
      const input = buildInput({
        avgFundingRate: 0.00005,
        openInterestChangePct: 1,
        fearGreedValue: 50,
        fearGreedPrevious: 50,
        percentChangeLookback: 0.5,
        realizedVolatility: 0.4,
      });

      const result = classifyRegime(input);

      expect(result.regime).toBe("CHOPPY_NEUTRAL");
      expect(result.recommendedStrategy).toBe("MEAN_REVERSION");
    });
  });

  describe("EXTREME classification (volatility gate)", () => {
    it("should classify high realised volatility as EXTREME with RISK_OFF regardless of other signals", () => {
      const input = buildInput({
        avgFundingRate: 0.0005, // would otherwise be bullish
        openInterestChangePct: 20,
        fearGreedValue: 70,
        fearGreedPrevious: 50,
        percentChangeLookback: 25,
        realizedVolatility: 1.5, // above EXTREME_VOLATILITY_THRESHOLD
      });

      const result = classifyRegime(input);

      expect(result.regime).toBe("EXTREME");
      expect(result.recommendedStrategy).toBe("RISK_OFF");
    });
  });

  describe("extreme funding rate contrarian behaviour", () => {
    it("should apply a contrarian bearish lean when funding is extremely positive (crowded long)", () => {
      const input = buildInput({ avgFundingRate: 0.002 });
      const result = classifyRegime(input);
      const fundingSignal = result.signals.find((s) => s.name === "funding_rate");
      expect(fundingSignal?.score).toBeLessThan(0);
    });

    it("should apply a contrarian bullish lean when funding is extremely negative (crowded short)", () => {
      const input = buildInput({ avgFundingRate: -0.002 });
      const result = classifyRegime(input);
      const fundingSignal = result.signals.find((s) => s.name === "funding_rate");
      expect(fundingSignal?.score).toBeGreaterThan(0);
    });
  });

  describe("fear & greed contrarian behaviour at extremes", () => {
    it("should lean bullish (contrarian) at Extreme Fear", () => {
      const input = buildInput({ fearGreedValue: 10, fearGreedPrevious: 15 });
      const result = classifyRegime(input);
      const fgSignal = result.signals.find((s) => s.name === "fear_greed");
      expect(fgSignal?.score).toBeGreaterThan(0);
    });

    it("should lean bearish (contrarian) at Extreme Greed", () => {
      const input = buildInput({ fearGreedValue: 90, fearGreedPrevious: 85 });
      const result = classifyRegime(input);
      const fgSignal = result.signals.find((s) => s.name === "fear_greed");
      expect(fgSignal?.score).toBeLessThan(0);
    });
  });

  describe("output shape", () => {
    it("should return all required fields with correct types", () => {
      const input = buildInput();
      const result = classifyRegime(input);

      expect(result).toMatchObject({
        symbol: "BTC",
        regime: expect.any(String),
        recommendedStrategy: expect.any(String),
        compositeScore: expect.any(Number),
        confidence: expect.any(Number),
        signals: expect.any(Array),
        classifiedAt: expect.any(String),
        validUntil: expect.any(String),
      });

      expect(result.signals).toHaveLength(4);
      for (const signal of result.signals) {
        expect(signal.score).toBeGreaterThanOrEqual(-1);
        expect(signal.score).toBeLessThanOrEqual(1);
        expect(signal.rationale).toBeTruthy();
      }

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("validUntil should be refreshHours after classifiedAt", () => {
      const input = buildInput();
      const result = classifyRegime(input, 6);

      const classified = new Date(result.classifiedAt).getTime();
      const valid = new Date(result.validUntil).getTime();
      const diffHours = (valid - classified) / (1000 * 60 * 60);

      expect(diffHours).toBeCloseTo(6, 1);
    });
  });

  describe("confidence scoring", () => {
    it("should produce higher confidence when all signals agree strongly", () => {
      const stronglyBullish = buildInput({
        avgFundingRate: 0.0002,
        openInterestChangePct: 20,
        fearGreedValue: 65,
        fearGreedPrevious: 50,
        percentChangeLookback: 19,
        realizedVolatility: 0.3,
      });

      const mixed = buildInput({
        avgFundingRate: 0.0002,
        openInterestChangePct: -10,
        fearGreedValue: 20,
        fearGreedPrevious: 50,
        percentChangeLookback: 19,
        realizedVolatility: 0.3,
      });

      const strongResult = classifyRegime(stronglyBullish);
      const mixedResult = classifyRegime(mixed);

      expect(strongResult.confidence).toBeGreaterThan(mixedResult.confidence);
    });
  });
});
