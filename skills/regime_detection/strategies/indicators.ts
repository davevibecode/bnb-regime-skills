import { PriceBar } from "./types";

/**
 * Simple Moving Average over the last `period` closes.
 * Returns null if there isn't enough history yet.
 */
export function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Standard deviation of the last `period` closes.
 */
export function stdDev(closes: number[], period: number): number | null {
  const mean = sma(closes, period);
  if (mean === null) return null;
  const slice = closes.slice(closes.length - period);
  const variance = slice.reduce((sum, c) => sum + (c - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

/**
 * Bollinger Bands: upper, middle (SMA), lower, and %B (position within the bands).
 * %B of 1.0 = price at upper band, 0.0 = price at lower band, 0.5 = at the middle.
 */
export function bollingerBands(
  closes: number[],
  period: number = 20,
  numStdDev: number = 2
): { upper: number; middle: number; lower: number; percentB: number } | null {
  const middle = sma(closes, period);
  const sd = stdDev(closes, period);
  if (middle === null || sd === null) return null;

  const upper = middle + numStdDev * sd;
  const lower = middle - numStdDev * sd;
  const lastClose = closes[closes.length - 1];
  const bandWidth = upper - lower;
  const percentB = bandWidth > 0 ? (lastClose - lower) / bandWidth : 0.5;

  return { upper, middle, lower, percentB };
}

/**
 * Relative Strength Index (RSI), Wilder's smoothing method, standard 14-period default.
 * Returns a value 0-100. Returns null if there isn't enough history.
 */
export function rsi(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Seed with a simple average over the first `period` changes
  let avgGain =
    changes.slice(0, period).filter((c) => c > 0).reduce((a, b) => a + b, 0) / period;
  let avgLoss =
    Math.abs(changes.slice(0, period).filter((c) => c < 0).reduce((a, b) => a + b, 0)) / period;

  // Wilder smoothing for the remaining changes
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Exponential Moving Average over the full closes series.
 * Returns the EMA value series aligned 1:1 with the input (first `period-1` entries are null).
 */
export function emaSeries(closes: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const result: (number | null)[] = new Array(closes.length).fill(null);

  if (closes.length < period) return result;

  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = ema;

  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result[i] = ema;
  }

  return result;
}

/**
 * MACD: fast EMA - slow EMA, plus the signal line (EMA of the MACD line) and histogram.
 * Standard defaults: 12/26/9.
 * Returns null if there isn't enough history for the slow EMA + signal line.
 */
export function macd(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macdLine: number; signalLine: number; histogram: number } | null {
  const fastEma = emaSeries(closes, fastPeriod);
  const slowEma = emaSeries(closes, slowPeriod);

  const macdSeries: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (fastEma[i] !== null && slowEma[i] !== null) {
      macdSeries.push((fastEma[i] as number) - (slowEma[i] as number));
    }
  }

  if (macdSeries.length < signalPeriod) return null;

  const signalSeries = emaSeries(macdSeries, signalPeriod);
  const macdLine = macdSeries[macdSeries.length - 1];
  const signalLine = signalSeries[signalSeries.length - 1];

  if (signalLine === null) return null;

  return {
    macdLine,
    signalLine,
    histogram: macdLine - signalLine,
  };
}

/**
 * Extracts the close price series from a bar array.
 */
export function closesOf(bars: PriceBar[]): number[] {
  return bars.map((b) => b.close);
}
