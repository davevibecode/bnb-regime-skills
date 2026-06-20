# Demo Transcript — Regime Detection Skill

This is a real, unedited transcript of this repo's test suite and backtest CLI running successfully, captured during development as the demo evidence for submission. No output below has been hand-edited — see the timestamps and exact command lines.

---

## 1. Full Test Suite (`yarn test`)

Command: `CI=true npx jest --forceExit --detectOpenHandles --verbose`

```
PASS skills/regime_detection/test/index.test.ts
  regimeDetection (top-level Skill function)
    happy path
      ✓ should return a successful classification with a mocked client (7 ms)
      ✓ should call all three CmcClient methods exactly once (2 ms)
      ✓ should pass the symbol through to the derivatives and price calls (2 ms)
      ✓ should respect custom lookbackDays and pass it through correctly (3 ms)
      ✓ should cap Fear & Greed lookback at 30 even if lookbackDays is larger (2 ms)
      ✓ should pass previousOpenInterestUsd through to the derivatives call (1 ms)
      ✓ should set validUntil refreshHours after classifiedAt (2 ms)
    error handling
      ✓ should return a SkillResult failure (not throw) when the derivatives call fails (2 ms)
      ✓ should return a SkillResult failure when the Fear & Greed call fails (2 ms)
      ✓ should return a SkillResult failure when the price call fails (2 ms)
      ✓ should never throw, even on failure (2 ms)
    end-to-end consistency with classifyRegime
      ✓ a strongly bullish mock input should classify as TRENDING_BULL via the full Skill path (5 ms)
      ✓ extreme realised volatility should force EXTREME/RISK_OFF via the full Skill path (2 ms)

PASS skills/regime_detection/test/engine.test.ts
  runBacktest
    basic execution
      ✓ should run end-to-end without throwing on a synthetic series (42 ms)
      ✓ should throw if bars and context have mismatched lengths (44 ms)
      ✓ should produce one step per bar after the warmup period (8 ms)
      ✓ should respect a custom warmup period (4 ms)
    no look-ahead bias
      ✓ the action chosen at bar i should be identical whether or not future bars exist (22 ms)
      ✓ equity at bar i should be identical whether or not future bars exist (13 ms)
    position lag discipline
      ✓ the very first post-warmup bar should have zero bar return (no prior position exists yet) (8 ms)
    transaction costs
      ✓ should reduce final equity compared to a zero-cost run, all else equal (21 ms)
    trade tracking
      ✓ every completed trade should have a valid direction and non-negative holding period (22 ms)
      ✓ trade count should roughly match the number of direction changes in steps (12 ms)
    metrics integration
      ✓ computeMetrics output should match the result.metrics already attached (9 ms)
      ✓ regime breakdown bar counts should sum to total steps (8 ms)
    determinism
      ✓ should produce identical results on repeated runs with the same seed (7 ms)

PASS skills/regime_detection/test/indicators.test.ts
  sma
    ✓ should return null when not enough data (1 ms)
    ✓ should compute the simple moving average correctly (1 ms)
    ✓ should use only the most recent `period` values (1 ms)
  stdDev
    ✓ should return null when not enough data (1 ms)
    ✓ should compute standard deviation correctly (2 ms)
    ✓ should return 0 for constant values (1 ms)
  bollingerBands
    ✓ should return null when not enough data (1 ms)
    ✓ should compute bands with correct ordering: lower < middle < upper (1 ms)
    ✓ should return %B near 1.0 when price is at the upper band (3 ms)
    ✓ should return %B near 0.0 when price is at the lower band (1 ms)
    ✓ should return %B near 0.5 for flat, unchanging prices (5 ms)
  rsi
    ✓ should return null when not enough data (1 ms)
    ✓ should return 100 for a strictly rising series with no losses (9 ms)
    ✓ should return a low RSI for a strictly falling series (1 ms)
    ✓ should return roughly 50 for a series with equal gains and losses (1 ms)
    ✓ should always return a value between 0 and 100 (2 ms)
  emaSeries
    ✓ should return an array the same length as input, with nulls before the period (1 ms)
    ✓ should seed the first EMA value with a simple average (1 ms)
  macd
    ✓ should return null when not enough data for slow EMA + signal (2 ms)
    ✓ should return a positive histogram for a steadily rising price series (1 ms)
    ✓ should return a negative histogram for a steadily falling price series

PASS skills/regime_detection/test/classifier.test.ts
  classifyRegime
    TRENDING_BULL classification
      ✓ should classify a strong bullish setup as TRENDING_BULL with MOMENTUM (2 ms)
    TRENDING_BEAR classification
      ✓ should classify a strong bearish setup as TRENDING_BEAR with MOMENTUM (5 ms)
    CHOPPY_NEUTRAL classification
      ✓ should classify a flat, low-conviction setup as CHOPPY_NEUTRAL with MEAN_REVERSION (1 ms)
    EXTREME classification (volatility gate)
      ✓ should classify high realised volatility as EXTREME with RISK_OFF regardless of other signals (5 ms)
    extreme funding rate contrarian behaviour
      ✓ should apply a contrarian bearish lean when funding is extremely positive (crowded long) (2 ms)
      ✓ should apply a contrarian bullish lean when funding is extremely negative (crowded short) (1 ms)
    fear & greed contrarian behaviour at extremes
      ✓ should lean bullish (contrarian) at Extreme Fear (1 ms)
      ✓ should lean bearish (contrarian) at Extreme Greed (1 ms)
    output shape
      ✓ should return all required fields with correct types (8 ms)
      ✓ validUntil should be refreshHours after classifiedAt (2 ms)
    confidence scoring
      ✓ should produce higher confidence when all signals agree strongly (18 ms)

PASS skills/regime_detection/test/mean-reversion.test.ts
  meanReversionStrategy
    ✓ should HOLD when there is insufficient history (1 ms)
    ✓ should signal SHORT when price spikes far above the upper Bollinger Band with confirming RSI (3 ms)
    ✓ should signal LONG when price spikes far below the lower Bollinger Band with confirming RSI (1 ms)
    ✓ should signal FLAT when price is near the middle band (1 ms)
    ✓ should weaken (not flip) a signal when Bollinger trigger fires but RSI does not confirm (1 ms)
    ✓ should always include a rationale string (1 ms)
    ✓ strength should always be between 0 and 1 (1 ms)

PASS skills/regime_detection/test/momentum.test.ts
  momentumStrategy
    ✓ should HOLD when there is insufficient history (1 ms)
    ✓ should signal LONG on a steadily rising price series (2 ms)
    ✓ should signal SHORT on a steadily falling price series (2 ms)
    ✓ should reduce LONG strength when RSI signals overbought exhaustion (3 ms)
    ✓ should always include a rationale string (2 ms)
    ✓ should respect a custom minStrength threshold (2 ms)
    ✓ strength should always be between 0 and 1 (1 ms)

PASS skills/regime_detection/test/dispatcher.test.ts
  dispatchStrategy
    ✓ should route to momentumStrategy when recommendedStrategy is MOMENTUM (5 ms)
    ✓ should route to meanReversionStrategy when recommendedStrategy is MEAN_REVERSION (1 ms)
    ✓ should force FLAT when recommendedStrategy is RISK_OFF, regardless of indicator state (1 ms)
    ✓ should never throw regardless of which strategy is dispatched (3 ms)

Test Suites: 7 passed, 7 total
Tests:       76 passed, 76 total
Snapshots:   0 total
Time:        3.848 s, estimated 4 s
Ran all test suites.
```

---

## 2. Backtest CLI — Synthetic Data, No API Key Required

Command: `yarn backtest --symbol=BTC --days=180`

```
Running backtest for BTC over 180 days (synthetic fixture)...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BACKTEST RESULT — BTC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Period           : 2025-01-31 → 2025-06-29
  Initial Capital  : $10,000
  Final Equity     : $11,055.611

  Total Return     : 10.56%
  Annualized Return: 27.66%
  Annualized Vol   : 4.96%
  Sharpe Ratio     : 4.95
  Max Drawdown     : 7.10% (2025-04-07 → 2025-05-24)

  Total Trades     : 10
  Win Rate         : 90.0%
  Avg Win / Loss   : 6.87% / -12.73%
  Profit Factor    : 4.86

  Regime Breakdown (bars spent / return contributed):
    TRENDING_BULL    :   30 bars  |  +8.60%
    TRENDING_BEAR    :   27 bars  |  +6.20%
    CHOPPY_NEUTRAL   :   93 bars  |  -4.71%
    EXTREME          :    0 bars  |  +0.00%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Full result written to: /home/claude/bnb-regime-skill/backtest-results/BTC-synthetic-1781932745507.json
```

---

## How to reproduce this yourself

```bash
git clone <this-repo>
cd bnb-regime-skill
yarn install
yarn test                              # matches section 1 above
yarn backtest --symbol=BTC --days=180  # matches section 2 above
```

For a live data run instead of the synthetic fixture, add a CMC API key to `.env` and run `yarn backtest --live --symbol=BTC --days=180`.
