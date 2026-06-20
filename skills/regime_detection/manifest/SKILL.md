| name           | regime-detection                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| description    | Classifies the current market regime for a cryptocurrency using derivatives positioning (funding rate, open interest trend), the Fear & Greed Index, and price trend, then recommends which trading sub-strategy (momentum or mean-reversion) should be active. Use when a user asks about market conditions, what strategy to run, whether a trend is real, or how to read funding rates. Trigger: "what regime is [coin] in", "should I trade momentum or mean-reversion on [coin]", "is the market trending or choppy", "read the funding rate for [coin]", "/regime-detection [coin]" |
| license        | MIT                                                                                                                                                                                                                                                                                                                                                                                           |
| compatibility  | >=1.0.0                                                                                                                                                                                                                                                                                                                                                                                       |
| user-invocable | true                                                                                                                                                                                                                                                                                                                                                                                          |
| allowed-tools  | mcp__cmc-mcp__get_crypto_quotes_latest \| mcp__cmc-mcp__get_crypto_technical_analysis \| mcp__cmc-mcp__get_derivatives_market_pairs \| mcp__cmc-mcp__get_fear_and_greed_latest \| mcp__cmc-mcp__get_fear_and_greed_historical                                                                                                                                                              |

# Regime Detection Skill

Classifies the current market regime for any CoinMarketCap-tracked cryptocurrency, then recommends which sub-strategy (momentum or mean-reversion) an agent should run. Built for the **BNB Hack: AI Trading Agent Edition — Track 2 (Strategy Skills)**.

This Skill is the meta-strategy layer: rather than committing to one trading style, it reads the market's current character — trending, choppy, or extreme — and tells the agent which style fits *right now*.

## Prerequisites

Before running this Skill, verify the CoinMarketCap MCP connection is available. If tools fail or return connection errors, ask the user to set up the MCP connection:

```json
{
  "mcpServers": {
    "cmc-mcp": {
      "url": "https://mcp.coinmarketcap.com/mcp",
      "headers": {
        "X-CMC-MCP-API-KEY": "your-api-key"
      }
    }
  }
}
```

Get your API key from <https://pro.coinmarketcap.com/login>

This Skill also ships as a standalone TypeScript package (no MCP required) for backtesting and direct integration — see `skills/regime_detection/src/index.ts` in this repo. The MCP tool calls below and the TypeScript `CmcClient` in that package hit the same underlying CMC endpoints; use whichever integration path fits your agent.

## Core Principle

A trading strategy that works in a trending market loses money in a choppy one, and vice versa. This Skill answers "which regime are we in?" *before* any strategy commits capital, using derivatives positioning as the primary signal — funding rate and open interest reveal what leveraged traders are actually doing, which leads price action rather than lagging it.

## Classification Workflow

### Step 1: Fetch Derivatives Positioning

Call `get_derivatives_market_pairs` with the target symbol to get funding rate and open interest across tracked exchanges. This is the primary signal (40% weight):

- **Extreme positive funding** (crowded long) → contrarian bearish lean, squeeze risk
- **Extreme negative funding** (crowded short) → contrarian bullish lean, squeeze risk
- **Moderate funding** → directionally confirming

### Step 2: Fetch Open Interest Trend

From the same call, compare current open interest to the prior reading:

- **OI rising + price rising** → healthy uptrend, new capital confirming (20% weight)
- **OI rising + price falling** → healthy downtrend, new capital confirming
- **OI falling** → positions unwinding, weak conviction either direction

### Step 3: Fetch Fear & Greed Index

Call `get_fear_and_greed_latest` and `get_fear_and_greed_historical`:

- **≤20 (Extreme Fear)** → contrarian bullish lean (20% weight)
- **≥80 (Extreme Greed)** → contrarian bearish lean
- **Middle range** → blends absolute level and day-over-day delta as a trend-confirming signal

### Step 4: Fetch Price Trend + Volatility

Call `get_crypto_quotes_latest` and `get_crypto_technical_analysis`:

- Percent change over the lookback window (20% weight, confirming)
- Realised volatility as a **risk gate** — above ~120% annualised, force `EXTREME` / `RISK_OFF` regardless of what the other three signals say

### Step 5: Classify and Recommend

Combine the four weighted signals into a composite score from -1 to +1:

| Regime | Composite Score | Recommended Strategy |
|---|---|---|
| `TRENDING_BULL` | ≥ +0.35 | MOMENTUM (long-biased) |
| `TRENDING_BEAR` | ≤ -0.35 | MOMENTUM (short-biased) |
| `CHOPPY_NEUTRAL` | between -0.35 and +0.35 | MEAN_REVERSION |
| `EXTREME` | (volatility gate overrides) | RISK_OFF |

## Sub-Strategy Reference

This Skill decides *which* strategy should run — the strategies themselves are separate, composable modules:

- **Momentum** (`skills/regime_detection/strategies/momentum.ts`): MACD line for direction, histogram for confirmation strength, RSI as an overbought/oversold **brake** on conviction (not a trigger).
- **Mean Reversion** (`skills/regime_detection/strategies/mean-reversion.ts`): Bollinger %B as the entry trigger, RSI as a confirming **filter** — the inverse role RSI plays in momentum.

## Report Structure

Present findings in this format:

```
## [Symbol] Regime Classification

### Current Regime: [TRENDING_BULL | TRENDING_BEAR | CHOPPY_NEUTRAL | EXTREME]
### Recommended Strategy: [MOMENTUM | MEAN_REVERSION | RISK_OFF]
### Confidence: [0-100%]

### Signal Breakdown
- Funding Rate (40%): [score] — [rationale]
- Open Interest Trend (20%): [score] — [rationale]
- Fear & Greed (20%): [score] — [rationale]
- Price Trend (20%): [score] — [rationale]

### Composite Score: [-1.00 to +1.00]
### Valid Until: [timestamp — re-classify after this]
```

## Important Notes

- This Skill recommends a strategy regime, it does not execute trades. Pair it with an execution layer (e.g. Trust Wallet Agent Kit) for live trading, or use the included backtest harness to validate the spec historically.
- Funding rate and Fear & Greed are read **contrarian at extremes, confirming in the middle range** — this asymmetry is intentional and documented in `src/classifier.ts`.
- The `EXTREME` volatility gate overrides all other signals. A strategy should never trade through it.

## Handling Tool Failures

If individual tools fail during classification:

1. **get_derivatives_market_pairs fails**: Cannot classify without the primary signal. Retry once; if it still fails, report "Derivatives data unavailable — regime classification incomplete" and do not recommend a strategy.
2. **get_fear_and_greed_latest fails**: Proceed with the other three signals; note "Sentiment signal unavailable, confidence reduced."
3. **get_crypto_quotes_latest fails**: Cannot compute price trend or volatility — the EXTREME risk gate cannot be checked. Report this explicitly; do not recommend MOMENTUM or MEAN_REVERSION without the volatility gate active.

Always disclose which signals were available when presenting a classification rather than silently proceeding with partial data.
