import { regimeDetection } from "../src/index";
import { CmcClient } from "../src/cmc-client";
import {
  DerivativesSnapshot,
  FearGreedSnapshot,
  PriceSnapshot,
} from "../src/types";

/**
 * These tests exercise the actual top-level Skill function judges/agents
 * call — regimeDetection() — using an injected mock CmcClient so they run
 * fast, deterministic, and with zero network calls or API key required.
 *
 * regimeDetection() accepts a `client` parameter precisely for this kind
 * of testing: see src/index.ts's second parameter.
 */

function makeMockClient(overrides: {
  derivatives?: Partial<DerivativesSnapshot>;
  fearGreed?: Partial<FearGreedSnapshot>;
  price?: Partial<PriceSnapshot>;
  failOn?: "derivatives" | "fearGreed" | "price";
} = {}): CmcClient {
  const derivatives: DerivativesSnapshot = {
    symbol: "BTC",
    avgFundingRate: 0.0002,
    totalOpenInterestUsd: 1_000_000_000,
    openInterestChangePct: 3,
    exchangeCount: 5,
    fetchedAt: new Date().toISOString(),
    ...overrides.derivatives,
  };

  const fearGreed: FearGreedSnapshot = {
    value: 55,
    classification: "Neutral",
    previousValue: 50,
    timestamp: new Date().toISOString(),
    ...overrides.fearGreed,
  };

  const price: PriceSnapshot = {
    symbol: "BTC",
    priceUsd: 65000,
    percentChangeLookback: 12,
    realizedVolatility: 0.45,
    fetchedAt: new Date().toISOString(),
    ...overrides.price,
  };

  return {
    getDerivativesSnapshot: jest.fn().mockImplementation(() => {
      if (overrides.failOn === "derivatives") {
        return Promise.reject(new Error("Simulated derivatives API failure"));
      }
      return Promise.resolve(derivatives);
    }),
    getFearGreedSnapshot: jest.fn().mockImplementation(() => {
      if (overrides.failOn === "fearGreed") {
        return Promise.reject(new Error("Simulated Fear & Greed API failure"));
      }
      return Promise.resolve(fearGreed);
    }),
    getPriceSnapshot: jest.fn().mockImplementation(() => {
      if (overrides.failOn === "price") {
        return Promise.reject(new Error("Simulated price API failure"));
      }
      return Promise.resolve(price);
    }),
  } as unknown as CmcClient;
}

describe("regimeDetection (top-level Skill function)", () => {
  describe("happy path", () => {
    it("should return a successful classification with a mocked client", async () => {
      const client = makeMockClient();
      const result = await regimeDetection({ symbol: "BTC" }, client);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.symbol).toBe("BTC");
        expect(["TRENDING_BULL", "TRENDING_BEAR", "CHOPPY_NEUTRAL", "EXTREME"]).toContain(
          result.data.regime
        );
        expect(["MOMENTUM", "MEAN_REVERSION", "RISK_OFF"]).toContain(
          result.data.recommendedStrategy
        );
        expect(result.data.signals).toHaveLength(4);
      }
    });

    it("should call all three CmcClient methods exactly once", async () => {
      const client = makeMockClient();
      await regimeDetection({ symbol: "ETH" }, client);

      expect(client.getDerivativesSnapshot).toHaveBeenCalledTimes(1);
      expect(client.getFearGreedSnapshot).toHaveBeenCalledTimes(1);
      expect(client.getPriceSnapshot).toHaveBeenCalledTimes(1);
    });

    it("should pass the symbol through to the derivatives and price calls", async () => {
      const client = makeMockClient();
      await regimeDetection({ symbol: "BNB" }, client);

      expect(client.getDerivativesSnapshot).toHaveBeenCalledWith("BNB", undefined);
      expect(client.getPriceSnapshot).toHaveBeenCalledWith("BNB", 14);
    });

    it("should respect custom lookbackDays and pass it through correctly", async () => {
      const client = makeMockClient();
      await regimeDetection({ symbol: "BTC", lookbackDays: 7 }, client);

      expect(client.getPriceSnapshot).toHaveBeenCalledWith("BTC", 7);
      // Fear & Greed historical lookback is capped at min(lookbackDays, 30)
      expect(client.getFearGreedSnapshot).toHaveBeenCalledWith(7);
    });

    it("should cap Fear & Greed lookback at 30 even if lookbackDays is larger", async () => {
      const client = makeMockClient();
      await regimeDetection({ symbol: "BTC", lookbackDays: 90 }, client);

      expect(client.getFearGreedSnapshot).toHaveBeenCalledWith(30);
    });

    it("should pass previousOpenInterestUsd through to the derivatives call", async () => {
      const client = makeMockClient();
      await regimeDetection(
        { symbol: "BTC", previousOpenInterestUsd: 900_000_000 },
        client
      );

      expect(client.getDerivativesSnapshot).toHaveBeenCalledWith("BTC", 900_000_000);
    });

    it("should set validUntil refreshHours after classifiedAt", async () => {
      const client = makeMockClient();
      const result = await regimeDetection({ symbol: "BTC", refreshHours: 6 }, client);

      expect(result.success).toBe(true);
      if (result.success) {
        const classified = new Date(result.data.classifiedAt).getTime();
        const valid = new Date(result.data.validUntil).getTime();
        expect((valid - classified) / (1000 * 60 * 60)).toBeCloseTo(6, 1);
      }
    });
  });

  describe("error handling", () => {
    it("should return a SkillResult failure (not throw) when the derivatives call fails", async () => {
      const client = makeMockClient({ failOn: "derivatives" });
      const result = await regimeDetection({ symbol: "BTC" }, client);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("REGIME_DETECTION_FAILED");
        expect(result.error.message).toMatch(/derivatives/i);
      }
    });

    it("should return a SkillResult failure when the Fear & Greed call fails", async () => {
      const client = makeMockClient({ failOn: "fearGreed" });
      const result = await regimeDetection({ symbol: "BTC" }, client);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toMatch(/Fear & Greed/i);
      }
    });

    it("should return a SkillResult failure when the price call fails", async () => {
      const client = makeMockClient({ failOn: "price" });
      const result = await regimeDetection({ symbol: "BTC" }, client);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toMatch(/price/i);
      }
    });

    it("should never throw, even on failure", async () => {
      const client = makeMockClient({ failOn: "derivatives" });
      await expect(regimeDetection({ symbol: "BTC" }, client)).resolves.toBeDefined();
    });
  });

  describe("end-to-end consistency with classifyRegime", () => {
    it("a strongly bullish mock input should classify as TRENDING_BULL via the full Skill path", async () => {
      const client = makeMockClient({
        derivatives: { avgFundingRate: 0.0003, openInterestChangePct: 3 },
        fearGreed: { value: 65, previousValue: 50 },
        price: { percentChangeLookback: 18, realizedVolatility: 0.4 },
      });

      const result = await regimeDetection({ symbol: "BTC" }, client);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.regime).toBe("TRENDING_BULL");
        expect(result.data.recommendedStrategy).toBe("MOMENTUM");
      }
    });

    it("extreme realised volatility should force EXTREME/RISK_OFF via the full Skill path", async () => {
      const client = makeMockClient({
        derivatives: { avgFundingRate: 0.0005, openInterestChangePct: 5 },
        fearGreed: { value: 70 },
        price: { percentChangeLookback: 25, realizedVolatility: 1.5 },
      });

      const result = await regimeDetection({ symbol: "BTC" }, client);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.regime).toBe("EXTREME");
        expect(result.data.recommendedStrategy).toBe("RISK_OFF");
      }
    });
  });
});
