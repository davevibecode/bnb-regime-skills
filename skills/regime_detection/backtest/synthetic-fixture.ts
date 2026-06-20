import { PriceBar } from "../strategies/types";
import { HistoricalContextBar } from "./engine";

/**
 * Generates a synthetic but realistic price + context series for offline
 * testing — no live API needed. Useful for:
 *  - CI test runs (deterministic, no network)
 *  - Judges who don't have a CMC key yet but want to see the backtest run
 *  - Sanity-checking the engine against known synthetic regimes
 *
 * The series is built in three deliberate phases so a reader can verify the
 * regime classifier responds correctly to each:
 *   Phase 1 (bull):   steady uptrend, funding rising, OI rising, F&G rising
 *   Phase 2 (choppy):  sideways chop, funding near zero, F&G neutral
 *   Phase 3 (bear):    steady downtrend, funding negative, OI rising, F&G falling
 */
export function generateSyntheticSeries(
  totalDays: number = 180,
  startPrice: number = 100,
  seed: number = 42
): { bars: PriceBar[]; context: HistoricalContextBar[] } {
  const bars: PriceBar[] = [];
  const context: HistoricalContextBar[] = [];

  let price = startPrice;
  let oi = 500_000_000;
  let fg = 50;
  let rand = mulberry32(seed);

  const phaseLength = Math.floor(totalDays / 3);

  for (let i = 0; i < totalDays; i++) {
    const phase = i < phaseLength ? "bull" : i < phaseLength * 2 ? "choppy" : "bear";

    let drift: number;
    let fundingRate: number;
    let oiDrift: number;
    let fgDrift: number;

    if (phase === "bull") {
      drift = 0.012 + (rand() - 0.5) * 0.01;
      fundingRate = 0.0003 + (rand() - 0.5) * 0.0002;
      oiDrift = 0.01 + rand() * 0.01;
      fgDrift = 0.4 + (rand() - 0.5) * 0.5;
    } else if (phase === "choppy") {
      drift = (rand() - 0.5) * 0.015;
      fundingRate = (rand() - 0.5) * 0.0003;
      oiDrift = (rand() - 0.5) * 0.01;
      fgDrift = (rand() - 0.5) * 0.6;
    } else {
      drift = -0.011 + (rand() - 0.5) * 0.01;
      fundingRate = -0.0003 + (rand() - 0.5) * 0.0002;
      oiDrift = 0.008 + rand() * 0.01;
      fgDrift = -0.4 + (rand() - 0.5) * 0.5;
    }

    price = price * (1 + drift);
    oi = oi * (1 + oiDrift);
    fg = clamp(fg + fgDrift, 5, 95);

    const open = price / (1 + drift);
    const high = Math.max(open, price) * (1 + rand() * 0.005);
    const low = Math.min(open, price) * (1 - rand() * 0.005);

    const timestamp = new Date(2025, 0, i + 1).toISOString();

    bars.push({
      timestamp,
      open,
      high,
      low,
      close: price,
      volume: 1_000_000_000 * (0.8 + rand() * 0.4),
    });

    context.push({
      timestamp,
      avgFundingRate: fundingRate,
      openInterestUsd: oi,
      fearGreedValue: Math.round(fg),
    });
  }

  return { bars, context };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Deterministic seeded PRNG (mulberry32) — same seed always produces the
 * same series, so tests and demo runs are reproducible.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
