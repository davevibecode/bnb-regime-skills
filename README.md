<div align="center">

# Regime Detection — A Strategy Skill for Crypto Trading Agents

**BNB Hack: AI Trading Agent Edition — Track 2 (Strategy Skills)**
Powered by the CoinMarketCap AI Agent Hub

[![Tests](https://img.shields.io/badge/tests-76%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen.svg)](LICENSE)

</div>

---

## What this is

A Strategy Skill that classifies the current market regime for any CoinMarketCap-tracked cryptocurrency — `TRENDING_BULL`, `TRENDING_BEAR`, `CHOPPY_NEUTRAL`, or `EXTREME` — using derivatives positioning as the primary signal, then recommends which sub-strategy (momentum or mean-reversion) should be active.

This is the meta-strategy layer the hackathon brief names directly: *"A regime-detection Skill that switches strategy based on derivatives positioning."*

**Read the full strategy spec:** [`docs/STRATEGY_SPEC.md`](docs/STRATEGY_SPEC.md) — signal construction, backtest methodology, results, and honestly-disclosed limitations.

**Read the agent-facing Skill definition:** [`skills/regime_detection/manifest/SKILL.md`](skills/regime_detection/manifest/SKILL.md) — matches the official CoinMarketCap Skill format, ready to drop into an agent's skills directory.

**See it actually run:** [`docs/DEMO_TRANSCRIPT.md`](docs/DEMO_TRANSCRIPT.md) — real, unedited output from the full test suite and a live backtest CLI run.

---

## Quick Start

```bash
yarn install
cp .env.example .env
# Add your CMC_API_KEY from https://pro.coinmarketcap.com/login

# Run the full test suite (76 tests, no API key needed)
yarn test

# Run a backtest on synthetic data (no API key needed)
yarn backtest --symbol=BTC --days=180

# Run a backtest on real CMC historical data (requires CMC_API_KEY)
yarn backtest --live --symbol=BTC --days=180
```

---

## How it works

Four weighted signals combine into a composite score:

| Signal | Weight | Behavior |
|---|---|---|
| Funding rate | 40% | Contrarian at extremes, confirming in normal range |
| Open interest trend | 20% | Confirming — rising OI + rising price = healthy trend |
| Fear & Greed Index | 20% | Contrarian at extremes, blended level+delta in the middle |
| Price trend | 20% | Confirming — raw % change over the lookback window |

Realised volatility acts as an independent risk gate — above ~120% annualised, the regime is forced to `EXTREME` regardless of the composite score.

```typescript
import { regimeDetection } from "./skills/regime_detection/src";

const result = await regimeDetection({ symbol: "BTC" });
if (result.success) {
  console.log(result.data.regime);              // "TRENDING_BULL"
  console.log(result.data.recommendedStrategy);  // "MOMENTUM"
  console.log(result.data.signals);              // full auditable breakdown
}
```

---

## Verified, not just written

Every component in this repo has been run and checked before being called done:

- **76/76 tests passing**, zero TypeScript errors
- **No-look-ahead-bias verified by automated test** — the backtest engine's classification and equity at bar *i* are confirmed bit-for-bit identical whether or not future bars exist in the series
- **Two real classifier bugs were caught and fixed during development**, not left in:
  - An open-interest threshold that never fired for realistic day-over-day OI moves (documented in `STRATEGY_SPEC.md` §5 and in code comments in `classifier.ts`)
  - A Fear & Greed mid-range signal that ignored the absolute index level, only reading day-over-day delta
- **Limitations are disclosed, not hidden** — see `STRATEGY_SPEC.md` §5 for what this spec does *not* solve yet (synthetic-vs-live data gap, CMC's lack of historical funding-rate endpoints, regime under-detection on strong trends, binary position sizing).

---

## Repo Structure

```
skills/regime_detection/
├── src/            # Classifier + CMC API client
├── strategies/      # Momentum + mean-reversion sub-strategies
├── backtest/         # Walk-forward simulator, metrics, CLI runner
├── manifest/          # Agent-facing SKILL.md (CMC Hub format)
└── test/               # 76 tests across all modules
docs/
└── STRATEGY_SPEC.md    # Full strategy spec — read this for the analysis
```

---

## Submission Notes

- **Track:** 2, Strategy Skills (no on-chain execution, no live trading — a backtestable strategy spec as required)
- **Data source:** CoinMarketCap Pro API — derivatives market-pairs, Fear & Greed Index, quotes/OHLCV
- **Composability:** designed to be called by a Track 1 Agent as a pre-trade regime check; does not touch execution or custody
- **Reproducibility:** `yarn test` and `yarn backtest` both run with zero configuration on synthetic data; live mode requires only a CMC API key

## License

MIT
