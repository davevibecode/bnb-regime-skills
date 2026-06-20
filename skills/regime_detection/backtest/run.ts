/**
 * Backtest CLI runner.
 *
 * Usage:
 *   yarn backtest                     → synthetic data, BTC-labelled, 180 days
 *   yarn backtest --symbol=ETH        → synthetic data for a different label
 *   yarn backtest --live              → real CMC historical data (requires CMC_API_KEY)
 *   yarn backtest --live --days=90    → real data, custom window
 *
 * Output: prints a summary table to console and writes the full
 * BacktestResult JSON to backtest-results/<symbol>-<timestamp>.json
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

import { runBacktest } from "./engine";
import { generateSyntheticSeries } from "./synthetic-fixture";
import { loadHistoricalData } from "./cmc-loader";
import { BacktestResult } from "./types";

function parseArgs(): { symbol: string; days: number; live: boolean } {
  const args = process.argv.slice(2);
  const symbol =
    args.find((a) => a.startsWith("--symbol="))?.split("=")[1] ?? "BTC";
  const days = Number(
    args.find((a) => a.startsWith("--days="))?.split("=")[1] ?? "180"
  );
  const live = args.includes("--live");
  return { symbol, days, live };
}

function printSummary(result: BacktestResult, fetchWarnings: string[] = []) {
  const { metrics } = result;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  BACKTEST RESULT — ${result.symbol}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Period           : ${result.startDate.slice(0, 10)} → ${result.endDate.slice(0, 10)}`);
  console.log(`  Initial Capital  : $${result.initialCapital.toLocaleString()}`);
  console.log(`  Final Equity     : $${result.finalEquity.toLocaleString()}`);
  console.log(``);
  console.log(`  Total Return     : ${metrics.totalReturnPct.toFixed(2)}%`);
  console.log(`  Annualized Return: ${metrics.annualizedReturnPct.toFixed(2)}%`);
  console.log(`  Annualized Vol   : ${metrics.annualizedVolatilityPct.toFixed(2)}%`);
  console.log(`  Sharpe Ratio     : ${metrics.sharpeRatio.toFixed(2)}`);
  console.log(`  Max Drawdown     : ${metrics.maxDrawdownPct.toFixed(2)}% (${metrics.maxDrawdownStart?.slice(0,10)} → ${metrics.maxDrawdownEnd?.slice(0,10)})`);
  console.log(``);
  console.log(`  Total Trades     : ${metrics.totalTrades}`);
  console.log(`  Win Rate         : ${metrics.winRate.toFixed(1)}%`);
  console.log(`  Avg Win / Loss   : ${metrics.avgWinPct.toFixed(2)}% / ${metrics.avgLossPct.toFixed(2)}%`);
  console.log(`  Profit Factor    : ${metrics.profitFactor === Infinity ? "∞" : metrics.profitFactor.toFixed(2)}`);
  console.log(``);
  console.log(`  Regime Breakdown (bars spent / return contributed):`);
  for (const regime of Object.keys(metrics.regimeBreakdown) as Array<keyof typeof metrics.regimeBreakdown>) {
    const bars = metrics.regimeBreakdown[regime];
    const ret = metrics.returnByRegime[regime];
    console.log(`    ${regime.padEnd(16)} : ${String(bars).padStart(4)} bars  |  ${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%`);
  }

  if (fetchWarnings.length > 0) {
    console.log(`\n  ⚠ Data warnings:`);
    for (const w of fetchWarnings) console.log(`    - ${w}`);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

async function main() {
  const { symbol, days, live } = parseArgs();

  console.log(`Running backtest for ${symbol} over ${days} days (${live ? "LIVE CMC data" : "synthetic fixture"})...`);

  let bars, context, fetchWarnings: string[] = [];

  if (live) {
    const result = await loadHistoricalData(symbol, days);
    bars = result.bars;
    context = result.context;
    fetchWarnings = result.fetchWarnings;
  } else {
    // Derive a seed from the symbol so different symbols produce genuinely
    // different synthetic series (not the same fixture relabelled) while
    // staying fully deterministic/reproducible for a given symbol.
    const seed = symbol
      .split("")
      .reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7) % 100000;
    const result = generateSyntheticSeries(days, 100, seed);
    bars = result.bars;
    context = result.context;
  }

  const result = runBacktest(bars, context, { symbol, warmupBars: 30 });

  printSummary(result, fetchWarnings);

  const outDir = path.join(process.cwd(), "backtest-results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const filename = `${symbol}-${live ? "live" : "synthetic"}-${Date.now()}.json`;
  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log(`Full result written to: ${outPath}`);
}

main().catch((err) => {
  console.error("Backtest failed:", err.message);
  process.exit(1);
});
