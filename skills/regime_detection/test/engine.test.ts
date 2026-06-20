import { runBacktest } from "../backtest/engine";
import { generateSyntheticSeries } from "../backtest/synthetic-fixture";
import { computeMetrics } from "../backtest/metrics";

describe("runBacktest", () => {
  describe("basic execution", () => {
    it("should run end-to-end without throwing on a synthetic series", () => {
      const { bars, context } = generateSyntheticSeries(180, 100, 42);
      expect(() => runBacktest(bars, context, { symbol: "BTC" })).not.toThrow();
    });

    it("should throw if bars and context have mismatched lengths", () => {
      const { bars, context } = generateSyntheticSeries(180, 100, 42);
      expect(() =>
        runBacktest(bars, context.slice(0, 100), { symbol: "BTC" })
      ).toThrow(/same length/);
    });

    it("should produce one step per bar after the warmup period", () => {
      const { bars, context } = generateSyntheticSeries(100, 100, 42);
      const result = runBacktest(bars, context, { symbol: "BTC", warmupBars: 30 });
      expect(result.steps).toHaveLength(100 - 30);
    });

    it("should respect a custom warmup period", () => {
      const { bars, context } = generateSyntheticSeries(100, 100, 42);
      const result = runBacktest(bars, context, { symbol: "BTC", warmupBars: 50 });
      expect(result.steps).toHaveLength(100 - 50);
    });
  });

  describe("no look-ahead bias", () => {
    it("the action chosen at bar i should be identical whether or not future bars exist", () => {
      // This is the critical correctness test: classify/strategy decisions at
      // bar i must depend ONLY on bars [0..i]. If we truncate the series right
      // after bar i and re-run, the LAST step's action/regime must be unchanged.
      const { bars, context } = generateSyntheticSeries(120, 100, 7);
      const fullResult = runBacktest(bars, context, { symbol: "BTC", warmupBars: 30 });

      const cutIndex = 80; // pick a bar well past warmup
      const truncatedBars = bars.slice(0, cutIndex + 1);
      const truncatedContext = context.slice(0, cutIndex + 1);
      const truncatedResult = runBacktest(truncatedBars, truncatedContext, {
        symbol: "BTC",
        warmupBars: 30,
      });

      const fullStepAtCut = fullResult.steps.find(
        (s) => s.timestamp === bars[cutIndex].timestamp
      );
      const truncatedLastStep = truncatedResult.steps[truncatedResult.steps.length - 1];

      expect(fullStepAtCut).toBeDefined();
      expect(truncatedLastStep.regime).toBe(fullStepAtCut!.regime);
      expect(truncatedLastStep.action).toBe(fullStepAtCut!.action);
      expect(truncatedLastStep.signalStrength).toBeCloseTo(fullStepAtCut!.signalStrength, 6);
    });

    it("equity at bar i should be identical whether or not future bars exist", () => {
      const { bars, context } = generateSyntheticSeries(120, 100, 7);
      const fullResult = runBacktest(bars, context, { symbol: "BTC", warmupBars: 30 });

      const cutIndex = 80;
      const truncatedBars = bars.slice(0, cutIndex + 1);
      const truncatedContext = context.slice(0, cutIndex + 1);
      const truncatedResult = runBacktest(truncatedBars, truncatedContext, {
        symbol: "BTC",
        warmupBars: 30,
      });

      const fullStepAtCut = fullResult.steps.find(
        (s) => s.timestamp === bars[cutIndex].timestamp
      );
      const truncatedLastStep = truncatedResult.steps[truncatedResult.steps.length - 1];

      // Equity should match exactly since it's a pure function of past returns + positions
      expect(truncatedLastStep.equity).toBeCloseTo(fullStepAtCut!.equity, 4);
    });
  });

  describe("position lag discipline", () => {
    it("the very first post-warmup bar should have zero bar return (no prior position exists yet)", () => {
      const { bars, context } = generateSyntheticSeries(100, 100, 42);
      const result = runBacktest(bars, context, { symbol: "BTC", warmupBars: 30 });
      expect(result.steps[0].barReturn).toBe(0);
    });
  });

  describe("transaction costs", () => {
    it("should reduce final equity compared to a zero-cost run, all else equal", () => {
      const { bars, context } = generateSyntheticSeries(150, 100, 42);
      const withCost = runBacktest(bars, context, {
        symbol: "BTC",
        warmupBars: 30,
        transactionCostPct: 0.01, // unrealistically high, to guarantee a visible effect
      });
      const noCost = runBacktest(bars, context, {
        symbol: "BTC",
        warmupBars: 30,
        transactionCostPct: 0,
      });

      expect(withCost.finalEquity).toBeLessThan(noCost.finalEquity);
    });
  });

  describe("trade tracking", () => {
    it("every completed trade should have a valid direction and non-negative holding period", () => {
      const { bars, context } = generateSyntheticSeries(180, 100, 42);
      const result = runBacktest(bars, context, { symbol: "BTC", warmupBars: 30 });

      for (const trade of result.trades) {
        expect(["LONG", "SHORT"]).toContain(trade.direction);
        expect(trade.holdingPeriodBars).toBeGreaterThanOrEqual(0);
        expect(trade.entryPrice).toBeGreaterThan(0);
        expect(trade.exitPrice).toBeGreaterThan(0);
      }
    });

    it("trade count should roughly match the number of direction changes in steps", () => {
      const { bars, context } = generateSyntheticSeries(180, 100, 42);
      const result = runBacktest(bars, context, { symbol: "BTC", warmupBars: 30 });
      // Loose sanity bound — trades should exist if there are any LONG/SHORT steps
      const hasDirectionalSteps = result.steps.some((s) => s.action === "LONG" || s.action === "SHORT");
      if (hasDirectionalSteps) {
        expect(result.trades.length).toBeGreaterThan(0);
      }
    });
  });

  describe("metrics integration", () => {
    it("computeMetrics output should match the result.metrics already attached", () => {
      const { bars, context } = generateSyntheticSeries(180, 100, 42);
      const result = runBacktest(bars, context, { symbol: "BTC", warmupBars: 30 });
      const recomputed = computeMetrics(result.steps, result.trades, result.initialCapital);
      expect(recomputed.totalReturnPct).toBeCloseTo(result.metrics.totalReturnPct, 4);
      expect(recomputed.sharpeRatio).toBeCloseTo(result.metrics.sharpeRatio, 4);
    });

    it("regime breakdown bar counts should sum to total steps", () => {
      const { bars, context } = generateSyntheticSeries(180, 100, 42);
      const result = runBacktest(bars, context, { symbol: "BTC", warmupBars: 30 });
      const totalBars = Object.values(result.metrics.regimeBreakdown).reduce((a, b) => a + b, 0);
      expect(totalBars).toBe(result.steps.length);
    });
  });

  describe("determinism", () => {
    it("should produce identical results on repeated runs with the same seed", () => {
      const series1 = generateSyntheticSeries(100, 100, 99);
      const series2 = generateSyntheticSeries(100, 100, 99);

      const result1 = runBacktest(series1.bars, series1.context, { symbol: "BTC", warmupBars: 30 });
      const result2 = runBacktest(series2.bars, series2.context, { symbol: "BTC", warmupBars: 30 });

      expect(result1.metrics.totalReturnPct).toBe(result2.metrics.totalReturnPct);
      expect(result1.finalEquity).toBe(result2.finalEquity);
    });
  });
});
