# Sprint 094B — DARWIN Historical Bootstrap

## Summary
Replayed 140,933 real MNQ 5-minute bars (Massive/Polygon.io, Jul 2024–Jul 2026) through the DARWIN pattern detection engine.

## Key Findings
- RANGE regime: 88.2% of all bars — zero coverage in current portfolio
- Overnight Inventory (RC-003): 93.3% win rate on 99.8% of trading days
- Portfolio health: 46.1/100 (day coverage: 1.1%)
- 6 research candidates generated and seeded into live DB

## Files
- `sprint094b_replay.py` — Historical replay engine
- `sprint094b_charts.py` — Chart generation
- `sprint094b_knowledge_base.json` — Full knowledge base output
- `SPRINT-094B-Foundational-Report.pdf` — Full institutional report
- `s094b_chart*.png` — All 4 charts

## Research Candidates Generated
| ID | Name | Win Rate | PF | Priority |
|---|---|---|---|---|
| RC-002 | Mean Reversion Gap Fill | 45.5% | 1.50 | 1 |
| RC-003 | Overnight Inventory Continuation | 93.3% | 19.40 | 2 |
| RC-004 | Failed Breakout Reversal | 62.0% | 2.61 | 3 |
| RC-005 | Liquidity Sweep Reversal | 68.0% | 3.19 | 4 |
| RC-006 | Volatility Expansion Momentum | 71.0% | 4.90 | 5 |
| RC-007 | Session Transition Momentum | 60.4% | 1.98 | 6 |
