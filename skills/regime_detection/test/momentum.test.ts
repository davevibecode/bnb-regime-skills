import { momentumStrategy } from "../strategies/momentum";
import { PriceBar } from "../strategies/types";

function makeBars(closes: number[]): PriceBar[] {
  return closes.map((close, i) => ({
    timestamp: new Date(2025, 0, i + 1).toISOString(),
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 1_000_000,
  }));
}

describe("momentumStrategy", () => {
  it("should HOLD when there is insufficient history", () => {
    const bars = makeBars([100, 101, 102]);
    const signal = momentumStrategy(bars);
    expect(signal.action).toBe("HOLD");
    expect(signal.strength).toBe(0);
  });

  it("should signal LONG on a steadily rising price series", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 1.2 + Math.sin(i / 3) * 0.5);
    const bars = makeBars(closes);
    const signal = momentumStrategy(bars);

    expect(signal.action).toBe("LONG");
    expect(signal.strength).toBeGreaterThan(0);
    expect(signal.strategyName).toBe("MOMENTUM");
  });

  it("should signal SHORT on a steadily falling price series", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 300 - i * 1.2 + Math.sin(i / 3) * 0.5);
    const bars = makeBars(closes);
    const signal = momentumStrategy(bars);

    expect(signal.action).toBe("SHORT");
    expect(signal.strength).toBeGreaterThan(0);
  });

  it("should reduce LONG strength when RSI signals overbought exhaustion", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 * Math.pow(1.03, i));
    const bars = makeBars(closes);
    const signal = momentumStrategy(bars);

    expect(signal.action === "LONG" || signal.action === "FLAT").toBe(true);
    if (signal.action === "LONG") {
      expect(signal.rationale).toMatch(/exhaustion|overbought/i);
    }
  });

  it("should always include a rationale string", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const bars = makeBars(closes);
    const signal = momentumStrategy(bars);
    expect(signal.rationale).toBeTruthy();
    expect(typeof signal.rationale).toBe("string");
  });

  it("should respect a custom minStrength threshold", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.05);
    const bars = makeBars(closes);
    const strict = momentumStrategy(bars, { minStrength: 0.9 });
    expect(strict.action).toBe("FLAT");
  });

  it("strength should always be between 0 and 1", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + i * 3);
    const bars = makeBars(closes);
    const signal = momentumStrategy(bars);
    expect(signal.strength).toBeGreaterThanOrEqual(0);
    expect(signal.strength).toBeLessThanOrEqual(1);
  });
});
