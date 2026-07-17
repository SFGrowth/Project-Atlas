# Atlas Capacity and Cost Model

**Document type:** Capacity and Cost Analysis  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17

---

## Overview

This document provides the capacity and cost model for the Atlas market data system. It covers DataBento subscription costs, storage costs, and the cost-benefit analysis of the DataBento integration relative to the current TradingView-only approach.

---

## DataBento Subscription Cost

The DataBento Standard plan is required for the Atlas integration. The Standard plan provides live data for GLBX.MDP3, 12 months of L1 historical data, and 1 month of L2 historical data.

| Plan | Monthly Cost | Annual Cost | Live Data | L1 History | L2 History |
|---|---|---|---|---|---|
| Standard | $199/month | $2,388/year | Included | 12 months | 1 month |
| Plus | $1,750/month | $21,000/year | Included | 5 years | 12 months |
| Unlimited | $4,500/month | $54,000/year | Included | All | All |

The Standard plan is selected for the initial deployment. The Plus plan would be required if DARWIN research needs more than 12 months of MBP-1 tick history.

### Historical Data Cost (Pay-Per-Use)

In addition to the subscription, DataBento charges for historical data downloads. The GLBX.MDP3 MBP-1 schema costs approximately $0.50–$2.00 per GB depending on the date range and volume. For DARWIN research requiring tick data beyond the 12-month subscription window, historical data is purchased on demand.

Estimated historical data cost for DARWIN research: $50–$200 per research cycle (depending on date range and number of queries).

---

## Storage Cost Model

### MySQL Hot Tier

The MySQL hot tier is included in the existing Atlas Nexus hosting plan. No additional cost.

| Table | Rows/Day | Row Size | 7-Day Size | Monthly Growth |
|---|---|---|---|---|
| `atlas_ticks` | 500,000 | 50 bytes | 175 MB | — (purged at 7 days) |
| `atlas_quotes` | 1,500,000 | 60 bytes | 630 MB | — (purged at 3 days) |
| `atlas_bars_1m` | 390 | 100 bytes | 274 KB | 1.2 MB |
| `atlas_memory` (5m bars) | 78 | 500 bytes | 273 KB | 1.2 MB |

Total MySQL steady-state size: approximately 800 MB (hot tier only). This is well within the existing MySQL instance capacity.

### S3 Cold Tier

Cold tier storage is estimated at $0.023 per GB per month (standard S3 pricing).

| Data Type | Annual Volume | Annual S3 Cost |
|---|---|---|
| Tick data (Parquet, compressed) | ~15 GB/year | ~$4.14/year |
| Quote data (Parquet, compressed) | ~45 GB/year | ~$12.42/year |
| 5-min bars (Parquet) | ~0.1 GB/year | ~$0.03/year |

Total cold tier storage cost: approximately **$17/year**.

---

## Total Cost of Ownership

| Cost Item | Monthly | Annual |
|---|---|---|
| DataBento Standard subscription | $199 | $2,388 |
| Historical data (DARWIN research) | ~$25 | ~$300 |
| S3 cold tier storage | ~$1.50 | ~$17 |
| **Total new costs** | **~$225.50** | **~$2,705** |

### Cost-Benefit Analysis

The DataBento integration adds approximately $225/month in new costs. The benefits are:

| Benefit | Quantitative Value |
|---|---|
| Intrabar data for DARWIN tick research | Enables new research capability (no current equivalent) |
| Live chart with developing bar | Improves operational awareness |
| Sub-second bar processing (vs 5-min webhook delay) | 300 seconds faster bar processing |
| Independent bar validation | Eliminates single point of failure |
| Contract roll detection | Prevents roll-gap indicator contamination |
| Replay engine capability | Enables deterministic backtesting |

The primary financial justification is the elimination of the single point of failure (TradingView M-16 webhook) for a live trading system managing $1,650/trade risk. A single missed bar due to a TradingView outage that results in a missed stop could cost more than 6 months of DataBento subscription fees.

---

## Capacity Scaling

The current design supports a single instrument (MNQ). If Atlas expands to additional instruments, the following capacity changes apply:

| Instruments | Tick Rate (RTH) | MySQL Hot Tier | DataBento Cost |
|---|---|---|---|
| 1 (MNQ only) | 8–33 events/sec | ~800 MB | $199/month |
| 3 (MNQ, NQ, ES) | 25–100 events/sec | ~2.4 GB | $199/month (same plan) |
| 10 (full portfolio) | 80–330 events/sec | ~8 GB | $199/month (same plan) |

The DataBento Standard plan supports up to 100 simultaneous sessions per dataset. Adding more instruments does not increase the DataBento subscription cost (all CME instruments are in the same GLBX.MDP3 dataset).

---

*This cost model is based on DataBento Standard plan pricing as of July 2026 and standard S3 pricing. Actual costs may vary.*
