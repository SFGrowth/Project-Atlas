# RC-001 — Opening Range EMA Reclaim

Strategy: 30-min ORB bias + 2-min EMA reclaim entry.
v1 baseline (synthetic): PF 1.34, 48.7% WR, 271 trades
v1 + regime filter (synthetic): PF 6.26, 84.1% WR, 63 trades — PRODUCTION CONFIG
v3 checklist+regime (synthetic): PF 5.17, 68.4% WR, 19 trades

NOTE: All backtests used synthetic data. Re-run required on real MNQ_5min_full.csv.
Prop risk: $450/trade (50K Apex). Live risk: $1,650/trade standard.
