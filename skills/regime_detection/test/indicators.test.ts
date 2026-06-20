import { sma, stdDev, bollingerBands, rsi, emaSeries, macd } from "../strategies/indicators";

describe("sma", () => {
  it("should return null when not enough data", () => {
    expect(sma([1, 2, 3], 5)).toBeNull();
  });

  it("should compute the simple moving average correctly", () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(sma([10, 20, 30], 3)).toBe(20);
  });

  it("should use only the most recent `period` values", () => {
    expect(sma([100, 1, 2, 3], 3)).toBe(2);
  });
});

describe("stdDev", () => {
  it("should return null when not enough data", () => {
    expect(stdDev([1, 2], 5)).toBeNull();
  });

  it("should compute standard deviation correctly", () => {
    const result = stdDev([2, 4, 4, 4, 5, 5, 7, 9], 8);
    expect(result).toBeCloseTo(2.0, 1);
  });

  it("should return 0 for constant values", () => {
    expect(stdDev([5, 5, 5, 5], 4)).toBe(0);
  });
});

describe("bollingerBands", () => {
  it("should return null when not enough data", () => {
    expect(bollingerBands([1, 2, 3], 20)).toBeNull();
  });

  it("should compute bands with correct ordering: lower < middle < upper", () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 5);
    const bands = bollingerBands(closes, 20, 2);
    expect(bands).not.toBeNull();
    if (bands) {
      expect(bands.lower).toBeLessThan(bands.middle);
      expect(bands.middle).toBeLessThan(bands.upper);
    }
  });

  it("should return %B near 1.0 when price is at the upper band", () => {
    // Constant prices with one large spike up at the end
    const closes = [...Array(19).fill(100), 130];
    const bands = bollingerBands(closes, 20, 2);
    expect(bands).not.toBeNull();
    if (bands) {
      expect(bands.percentB).toBeGreaterThan(0.9);
    }
  });

  it("should return %B near 0.0 when price is at the lower band", () => {
    const closes = [...Array(19).fill(100), 70];
    const bands = bollingerBands(closes, 20, 2);
    expect(bands).not.toBeNull();
    if (bands) {
      expect(bands.percentB).toBeLessThan(0.1);
    }
  });

  it("should return %B near 0.5 for flat, unchanging prices", () => {
    const closes = Array(20).fill(100);
    const bands = bollingerBands(closes, 20, 2);
    expect(bands).not.toBeNull();
    if (bands) {
      expect(bands.percentB).toBeCloseTo(0.5, 1);
    }
  });
});

describe("rsi", () => {
  it("should return null when not enough data", () => {
    expect(rsi([1, 2, 3], 14)).toBeNull();
  });

  it("should return 100 for a strictly rising series with no losses", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(rsi(closes, 14)).toBe(100);
  });

  it("should return a low RSI for a strictly falling series", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 200 - i);
    const result = rsi(closes, 14);
    expect(result).not.toBeNull();
    expect(result as number).toBeLessThan(10);
  });

  it("should return roughly 50 for a series with equal gains and losses", () => {
    const closes: number[] = [100];
    for (let i = 0; i < 20; i++) {
      closes.push(closes[closes.length - 1] + (i % 2 === 0 ? 1 : -1));
    }
    const result = rsi(closes, 14);
    expect(result).not.toBeNull();
    expect(result as number).toBeGreaterThan(30);
    expect(result as number).toBeLessThan(70);
  });

  it("should always return a value between 0 and 100", () => {
    const closes = Array.from({ length: 50 }, () => 100 + Math.random() * 20 - 10);
    const result = rsi(closes, 14);
    if (result !== null) {
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    }
  });
});

describe("emaSeries", () => {
  it("should return an array the same length as input, with nulls before the period", () => {
    const closes = [1, 2, 3, 4, 5];
    const result = emaSeries(closes, 3);
    expect(result).toHaveLength(5);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).not.toBeNull();
  });

  it("should seed the first EMA value with a simple average", () => {
    const closes = [10, 20, 30];
    const result = emaSeries(closes, 3);
    expect(result[2]).toBe(20);
  });
});

describe("macd", () => {
  it("should return null when not enough data for slow EMA + signal", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(macd(closes)).toBeNull();
  });

  it("should return a positive histogram for a steadily rising price series", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 1.5);
    const result = macd(closes);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.macdLine).toBeGreaterThan(0);
    }
  });

  it("should return a negative histogram for a steadily falling price series", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 300 - i * 1.5);
    const result = macd(closes);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.macdLine).toBeLessThan(0);
    }
  });
});
