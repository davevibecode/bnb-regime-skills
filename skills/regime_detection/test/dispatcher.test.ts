import { dispatchStrategy } from "../strategies/dispatcher";
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

describe("dispatchStrategy", () => {
  const risingCloses = Array.from({ length: 60 }, (_, i) => 100 + i * 1.2 + Math.sin(i / 3) * 0.5);
  const choppyCloses = [...Array(25).fill(100), 105, 110, 115, 120];

  it("should route to momentumStrategy when recommendedStrategy is MOMENTUM", () => {
    const bars = makeBars(risingCloses);
    const signal = dispatchStrategy("MOMENTUM", bars);
    expect(signal.strategyName).toBe("MOMENTUM");
  });

  it("should route to meanReversionStrategy when recommendedStrategy is MEAN_REVERSION", () => {
    const bars = makeBars(choppyCloses);
    const signal = dispatchStrategy("MEAN_REVERSION", bars);
    expect(signal.strategyName).toBe("MEAN_REVERSION");
  });

  it("should force FLAT when recommendedStrategy is RISK_OFF, regardless of indicator state", () => {
    const bars = makeBars(risingCloses); // would otherwise be a strong LONG
    const signal = dispatchStrategy("RISK_OFF", bars);
    expect(signal.action).toBe("FLAT");
    expect(signal.rationale).toMatch(/RISK_OFF|extreme volatility/i);
  });

  it("should never throw regardless of which strategy is dispatched", () => {
    const bars = makeBars([100, 101, 99]); // too short for any indicator
    expect(() => dispatchStrategy("MOMENTUM", bars)).not.toThrow();
    expect(() => dispatchStrategy("MEAN_REVERSION", bars)).not.toThrow();
    expect(() => dispatchStrategy("RISK_OFF", bars)).not.toThrow();
  });
});
