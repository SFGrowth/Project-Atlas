# Atlas External Research Run 001

## Purpose

Run the first external Python research-engine test using the Massive MNQ dataset.

This compares Hypothesis 001 Off versus Hypothesis 001 Block.

## Source

CSV: data/raw/massive/MNQ_5min_2yr_massive.csv

## Hypothesis 001

Trades fail when strong pressure occurs into a reaction zone.

## H001 Off

Trades: 758
Net PnL: 3139.50
Gross Profit: 66652.00
Gross Loss: -63512.50
Profit Factor: 1.049
Win Rate: 43.27%
Average Trade: 4.14
Max Drawdown: -4701.50
Largest Losing Streak: 9

## H001 Block

Trades: 706
Net PnL: 8600.00
Gross Profit: 66944.50
Gross Loss: -58344.50
Profit Factor: 1.147
Win Rate: 44.90%
Average Trade: 12.18
Max Drawdown: -3785.00
Largest Losing Streak: 9

## Comparison

Trades removed: 52
Net PnL change: 5460.50
Average Trade change: 8.04
Profit Factor change: 0.098
Max Drawdown change: 916.50

## H001 Baseline Condition

H001 trades in baseline: 189
H001 baseline net PnL: -3130.50
H001 baseline average trade: -16.56
H001 baseline win rate: 40.74%

## Decision

This is the first external Atlas research-engine run.

Do not treat as production approval until reviewed against TradingView results and contract stitching limitations.

## Generated Files

- research/atlas_external_trades_h001_off.csv
- research/atlas_external_trades_h001_block.csv
