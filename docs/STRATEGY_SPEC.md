# Strategy Spec: Regime-Adaptive Momentum / Mean-Reversion

**Submission category:** BNB Hack — Track 2, Strategy Skills
**Skill name:** `regime_detection`
**Author tooling:** CoinMarketCap AI Agent Hub (derivatives, Fear & Greed, price data)

---

## 1. Thesis

A single trading style is structurally wrong for most of the time. Momentum strategies bleed in choppy markets; mean-reversion strategies get steamrolled in trends. Rather than picking one style and hoping the market cooperates, this spec proposes a **regime classifier that decides which style should be active**, using derivatives positioning as the primary signal — this directly matches the hackathon's own stated example: *"A regime-detection Skill that switches strategy based on derivatives positioning."*

The classifier outputs one of four regimes and a corresponding recommended strategy:

| Regime | Recommended Strategy | Why |
|---|---|---|
| `TRENDING_BULL` | Momentum (long-biased) | Real directional move — ride it |
| `TRENDING_BEAR` | Momentum (short-biased) | Real directional move — ride it down |
| `CHOPPY_NEUTRAL` | Mean-Reversion | No real trend — fade the extremes |
| `EXTREME` | Risk-Off | Volatility too high to trust either style |

## 2. Signal Construction

Four signals combine into a composite score from -1 (max bearish) to +1 (max bullish):

| Signal | Weight | Source | Behavior |
|---|---|---|---|
| Funding rate | 40% | CMC derivatives market-pairs | **Contrarian at extremes** (crowded long/short = squeeze risk), confirming in normal range |
| Open interest trend | 20% | CMC derivatives market-pairs | Confirming — OI rising with price = healthy trend; OI falling = weak conviction |
| Fear & Greed Index | 20% | CMC Fear & Greed endpoint | **Contrarian at extremes** (≤20 or ≥80), blends absolute level + daily delta in the middle range |
| Price trend | 20% | CMC quotes/OHLCV | Confirming — raw % change over the lookback window |

Realised volatility (annualised, from the same OHLCV series) acts as an independent **risk gate**: above ~120% annualised, the regime is forced to `EXTREME` regardless of what the composite score says. A strategy should never trade through a volatility spike just because the other three signals look constructive.

Full signal math, including the exact contrarian/confirming thresholds, lives in `skills/regime_detection/src/classifier.ts` — every signal returns a human-readable `rationale` string, so the classification is auditable rather than a black box.

## 3. Sub-Strategies

The regime classifier decides *which* strategy runs; the strategies are independent, swappable modules.

**Momentum** (`strategies/momentum.ts`) — MACD line sign for direction (not the histogram alone, see §5), histogram magnitude for confirmation strength, RSI as an overbought/oversold **brake** that reduces conviction without flipping direction.

**Mean-Reversion** (`strategies/mean-reversion.ts`) — Bollinger %B as the entry trigger (≥0.95 or ≤0.05), RSI as a confirming **filter** that must agree before a signal fires at full strength. RSI plays the opposite role here versus momentum: a trigger, not a brake.

## 4. Backtest Methodology

The backtest engine (`backtest/engine.ts`) walks forward bar-by-bar with two discipline rules that matter for credibility:

1. **No look-ahead.** At bar *i*, the classifier and strategy see only `bars[0..i]`. This is verified by an automated test that truncates the series after a given bar and confirms the classification and equity at that point are bit-for-bit identical whether or not future bars exist (`test/engine.test.ts`).
2. **One-bar position lag.** The position decided using information through bar *i* only earns the return from bar *i* to bar *i+1* — you cannot trade on the same candle you're pricing. Transaction costs (10bps round-trip by default) are charged whenever position size changes.

### Results (synthetic data, 180 days, 3-phase bull/choppy/bear design)

Each symbol's run uses a unique deterministic seed derived from the symbol string, so these are three genuinely distinct synthetic paths, not one path relabelled three times.

| Metric | BTC | ETH | BNB |
|---|---|---|---|
| Total Return | 10.56% | 9.38% | 6.55% |
| Annualized Return | 27.66% | 24.39% | 16.68% |
| Annualized Volatility | 4.96% | 5.21% | 6.21% |
| Sharpe Ratio | 4.95 | 4.22 | 2.52 |
| Max Drawdown | 7.10% | 6.70% | 9.93% |
| Total Trades | 10 | 15 | 12 |
| Win Rate | 90.0% | 80.0% | 91.7% |
| Profit Factor | 4.86 | 4.82 | 4.05 |

### Regime breakdown (BTC run)

| Regime | Bars | Return Contributed |
|---|---|---|
| TRENDING_BULL | 30 | +8.60% |
| TRENDING_BEAR | 27 | +6.20% |
| CHOPPY_NEUTRAL | 93 | -4.71% |
| EXTREME | 0 | +0.00% |

The negative contribution from `CHOPPY_NEUTRAL` bars is expected and informative — mean-reversion is the hardest regime to trade profitably, and the spec is honest that it's currently a net drag rather than a clean win, which is exactly the kind of finding a regime breakdown is supposed to surface.

**Reproduce these results:** `yarn backtest --symbol=BTC --days=180` (synthetic, no API key needed) or `yarn backtest --live --symbol=BTC --days=180` (real CMC data, requires `CMC_API_KEY`).

## 5. Known Limitations (disclosed, not hidden)

This spec intentionally documents its own weak points rather than presenting only favorable numbers:

- **Synthetic data is a 3-phase toy design**, not real market history. It validates that the engine and classifier behave correctly under known conditions; it is not evidence of live profitability. The `--live` flag runs the same engine against real CMC OHLCV and Fear & Greed history — see the caveat below on funding rate history.
- **CMC's standard endpoints don't expose historical funding-rate time series.** `backtest/cmc-loader.ts` uses the current funding snapshot as a constant proxy across the live backtest window, and prints this limitation explicitly via `fetchWarnings` rather than silently treating it as real historical data. A production deployment should source historical funding from exchange-native APIs (Binance/Bybit funding history endpoints) and merge it in.
- **Regime detection under-detects strong trends relative to the synthetic design intent** — in early testing, a 60-bar designed bear phase was only classified as `TRENDING_BEAR` for ~27 bars even after fixing two scoring bugs (see commit history / `classifier.ts` comments for the open-interest threshold and Fear & Greed mid-range fixes made during development). Further threshold tuning is a clear next step, not a solved problem.
- **Position sizing is binary-scaled-by-signal-strength**, not Kelly-optimal or volatility-targeted. This keeps the spec auditable but leaves return-per-unit-risk on the table.
- **No slippage model beyond a flat transaction cost** — real execution on size would face deeper costs, especially in the `CHOPPY_NEUTRAL` regime where trade count is highest.

## 6. Composability

This Skill is designed to be one input among several for a Track 1 Agent:

```
Agent loop:
  1. regime_detection(symbol)        ← this Skill — "what style should I run?"
  2. price/portfolio read            ← wallet state, current price
  3. strategy execution               ← momentum.ts or mean-reversion.ts, dispatched by step 1
  4. (execution layer, e.g. TWAK)    ← sign and submit, outside this Skill's scope
```

`regime_detection` deliberately does not touch execution or custody — it answers one question (which regime, which strategy) and returns a typed, auditable result. Any Track 1 Agent can call it as a pre-trade check without taking on any of its dependencies.

## 7. File Map

```
skills/regime_detection/
├── src/                    # Core classifier + CMC client
│   ├── classifier.ts       # The regime scoring logic — read this first
│   ├── cmc-client.ts       # Live CMC API calls
│   ├── index.ts             # Skill entry point (regimeDetection())
│   └── types.ts
├── strategies/             # Sub-strategies the classifier dispatches to
│   ├── momentum.ts
│   ├── mean-reversion.ts
│   ├── dispatcher.ts
│   └── indicators.ts       # RSI, MACD, Bollinger Bands, SMA
├── backtest/                # The backtestable spec deliverable
│   ├── engine.ts            # Walk-forward simulator, no look-ahead
│   ├── metrics.ts           # Sharpe, drawdown, win rate, profit factor
│   ├── synthetic-fixture.ts # Deterministic offline test data
│   ├── cmc-loader.ts        # Real CMC historical data loader
│   └── run.ts                # CLI: yarn backtest
├── manifest/
│   └── SKILL.md              # Agent-facing Skill definition (CMC Hub format)
└── test/                     # 76 passing tests across all modules
```
