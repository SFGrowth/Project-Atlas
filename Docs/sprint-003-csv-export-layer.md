# Sprint 003 — CSV Export Layer

## Objective

Add exportable numeric Atlas state fields so TradingView chart data can be exported to CSV for external analysis.

Manual replay logging was too slow and painful. A CSV export layer gives Atlas a more scalable validation path.

## Status

Validated in TradingView.

## Scope

### Included

- Numeric code for Bias
- Numeric code for Volatility State
- Numeric code for Risk Mode
- Numeric code for Regime
- Export plots for ATR, ATR baseline, and RSI
- TradingView compile validation

### Excluded

- Trade signals
- Automation
- TradersPost routing
- Live execution
- Statistical analysis scripts

## Export Codes

### Bias Code

```text
bullish = 1
neutral = 0
bearish = -1