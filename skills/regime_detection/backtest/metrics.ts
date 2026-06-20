import { BacktestStep, CompletedTrade, BacktestMetrics } from "./types";
import { MarketRegime } from "../src/types";

/**
 * Computes annualised return from a total return and the number of bars,
 * assuming daily bars (365 bars/year — crypto trades every day, no market holidays).
 */
function annualizeReturn(totalReturnPct: number, numBars: number): number {
  if (numBars === 0) return 0;
  const totalReturnDecimal = totalReturnPct / 100;
  const years = numBars / 365;
  if (years <= 0) return 0;
  const cagr = Math.pow(1 + totalReturnDecimal, 1 / years) - 1;
  return cagr * 100;
}

/**
 * Computes annualised volatility from per-bar returns.
 */
function annualizeVolatility(barReturns: number[]): number {
  if (barReturns.length < 2) return 0;
  const mean = barReturns.reduce((a, b) => a + b, 0) / barReturns.length;
  const variance =
    barReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
    (barReturns.length - 1);
  const dailyStdDev = Math.sqrt(variance);
  return dailyStdDev * Math.sqrt(365) * 100;
}

/**
 * Sharpe ratio using a 0% risk-free rate (standard simplification for crypto
 * strategy comparison — relative ranking matters more than the absolute number).
 */
function computeSharpe(barReturns: number[]): number {
  if (barReturns.length < 2) return 0;
  const mean = barReturns.reduce((a, b) => a + b, 0) / barReturns.length;
  const variance =
    barReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
    (barReturns.length - 1);
  const dailyStdDev = Math.sqrt(variance);
  if (dailyStdDev === 0) return 0;
  return (mean / dailyStdDev) * Math.sqrt(365);
}

/**
 * Computes the maximum peak-to-trough drawdown from an equity curve.
 */
function computeMaxDrawdown(steps: BacktestStep[]): {
  maxDrawdownPct: number;
  start: string | null;
  end: string | null;
} {
  let peak = steps[0]?.equity ?? 0;
  let peakTimestamp = steps[0]?.timestamp ?? null;
  let maxDrawdown = 0;
  let ddStart: string | null = null;
  let ddEnd: string | null = null;

  for (const step of steps) {
    if (step.equity > peak) {
      peak = step.equity;
      peakTimestamp = step.timestamp;
    }
    const drawdown = peak > 0 ? (peak - step.equity) / peak : 0;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      ddStart = peakTimestamp;
      ddEnd = step.timestamp;
    }
  }

  return { maxDrawdownPct: maxDrawdown * 100, start: ddStart, end: ddEnd };
}

/**
 * Computes win rate, average win/loss, and profit factor from completed trades.
 */
function computeTradeStats(trades: CompletedTrade[]): {
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
} {
  if (trades.length === 0) {
    return { winRate: 0, avgWinPct: 0, avgLossPct: 0, profitFactor: 0 };
  }

  const wins = trades.filter((t) => t.returnPct > 0);
  const losses = trades.filter((t) => t.returnPct <= 0);

  const winRate = (wins.length / trades.length) * 100;
  const avgWinPct =
    wins.length > 0
      ? (wins.reduce((sum, t) => sum + t.returnPct, 0) / wins.length) * 100
      : 0;
  const avgLossPct =
    losses.length > 0
      ? (losses.reduce((sum, t) => sum + t.returnPct, 0) / losses.length) * 100
      : 0;

  const grossProfit = wins.reduce((sum, t) => sum + t.returnPct, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.returnPct, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  return { winRate, avgWinPct, avgLossPct, profitFactor };
}

/**
 * Computes the regime breakdown — how many bars were spent in each regime,
 * and the cumulative return contributed while in each regime.
 */
function computeRegimeBreakdown(
  steps: BacktestStep[]
): { breakdown: Record<MarketRegime, number>; returnByRegime: Record<MarketRegime, number> } {
  const breakdown: Record<MarketRegime, number> = {
    TRENDING_BULL: 0,
    TRENDING_BEAR: 0,
    CHOPPY_NEUTRAL: 0,
    EXTREME: 0,
  };

  const returnByRegime: Record<MarketRegime, number> = {
    TRENDING_BULL: 0,
    TRENDING_BEAR: 0,
    CHOPPY_NEUTRAL: 0,
    EXTREME: 0,
  };

  for (const step of steps) {
    breakdown[step.regime] += 1;
    returnByRegime[step.regime] += step.barReturn * 100;
  }

  return { breakdown, returnByRegime };
}

/**
 * Computes the full BacktestMetrics object from a completed run's steps and trades.
 */
export function computeMetrics(
  steps: BacktestStep[],
  trades: CompletedTrade[],
  initialCapital: number
): BacktestMetrics {
  if (steps.length === 0) {
    return {
      totalReturnPct: 0,
      annualizedReturnPct: 0,
      annualizedVolatilityPct: 0,
      sharpeRatio: 0,
      maxDrawdownPct: 0,
      maxDrawdownStart: null,
      maxDrawdownEnd: null,
      totalTrades: 0,
      winRate: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      profitFactor: 0,
      regimeBreakdown: { TRENDING_BULL: 0, TRENDING_BEAR: 0, CHOPPY_NEUTRAL: 0, EXTREME: 0 },
      returnByRegime: { TRENDING_BULL: 0, TRENDING_BEAR: 0, CHOPPY_NEUTRAL: 0, EXTREME: 0 },
    };
  }

  const finalEquity = steps[steps.length - 1].equity;
  const totalReturnPct = ((finalEquity - initialCapital) / initialCapital) * 100;
  const barReturns = steps.map((s) => s.barReturn);

  const { maxDrawdownPct, start, end } = computeMaxDrawdown(steps);
  const tradeStats = computeTradeStats(trades);
  const { breakdown, returnByRegime } = computeRegimeBreakdown(steps);

  return {
    totalReturnPct: Number(totalReturnPct.toFixed(4)),
    annualizedReturnPct: Number(annualizeReturn(totalReturnPct, steps.length).toFixed(4)),
    annualizedVolatilityPct: Number(annualizeVolatility(barReturns).toFixed(4)),
    sharpeRatio: Number(computeSharpe(barReturns).toFixed(4)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(4)),
    maxDrawdownStart: start,
    maxDrawdownEnd: end,
    totalTrades: trades.length,
    winRate: Number(tradeStats.winRate.toFixed(2)),
    avgWinPct: Number(tradeStats.avgWinPct.toFixed(4)),
    avgLossPct: Number(tradeStats.avgLossPct.toFixed(4)),
    profitFactor: Number(tradeStats.profitFactor.toFixed(4)),
    regimeBreakdown: breakdown,
    returnByRegime: Object.fromEntries(
      Object.entries(returnByRegime).map(([k, v]) => [k, Number(v.toFixed(4))])
    ) as Record<MarketRegime, number>,
  };
}
