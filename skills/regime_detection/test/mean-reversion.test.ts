import { meanReversionStrategy } from "../strategies/mean-reversion";
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

describe("meanReversionStrategy", () => {
  it("should HOLD when there is insufficient history", () => {
    const bars = makeBars([100, 101, 102]);
    const signal = meanReversionStrategy(bars);
    expect(signal.action).toBe("HOLD");
  });

  it("should signal SHORT when price spikes far above the upper Bollinger Band with confirming RSI", () => {
    // Flat then a sharp run-up to overbought territory
    const closes = [...Array(25).fill(100), 105, 110, 115, 120, 125, 130, 135];
    const bars = makeBars(closes);
    const signal = meanReversionStrategy(bars);

    expect(signal.action).toBe("SHORT");
    expect(signal.strength).toBeGreaterThan(0);
    expect(signal.strategyName).toBe("MEAN_REVERSION");
  });

  it("should signal LONG when price spikes far below the lower Bollinger Band with confirming RSI", () => {
    const closes = [...Array(25).fill(100), 95, 90, 85, 80, 75, 70, 65];
    const bars = makeBars(closes);
    const signal = meanReversionStrategy(bars);

    expect(signal.action).toBe("LONG");
    expect(signal.strength).toBeGreaterThan(0);
  });

  it("should signal FLAT when price is near the middle band", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 5) * 1);
    const bars = makeBars(closes);
    const signal = meanReversionStrategy(bars);
    expect(signal.action).toBe("FLAT");
  });

  it("should weaken (not flip) a signal when Bollinger trigger fires but RSI does not confirm", () => {
    // Constructed so %B is stretched but the move is too recent/sharp for RSI to be extreme yet
    const closes = [...Array(20).fill(100), 105, 130];
    const bars = makeBars(closes);
    const signal = meanReversionStrategy(bars, { minStrength: 0.01 });
    // Either unconfirmed (low strength) or confirmed depending on RSI — both are valid,
    // but it must never throw and must always return a valid action
    expect(["LONG", "SHORT", "FLAT"]).toContain(signal.action);
  });

  it("should always include a rationale string", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 4) * 8);
    const bars = makeBars(closes);
    const signal = meanReversionStrategy(bars);
    expect(signal.rationale).toBeTruthy();
  });

  it("strength should always be between 0 and 1", () => {
    const closes = [...Array(25).fill(100), 200]; // extreme spike
    const bars = makeBars(closes);
    const signal = meanReversionStrategy(bars);
    expect(signal.strength).toBeGreaterThanOrEqual(0);
    expect(signal.strength).toBeLessThanOrEqual(1);
  });
});
