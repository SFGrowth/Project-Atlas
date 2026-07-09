"""
Atlas Sprint 062 — Market State Engine (MSE) & Atlas Decision Engine (ADE) Design

This script formalises the complete data schemas and scoring logic for:
  - Layer 1: Market State Object (MSO) — every field, type, and derivation rule
  - Layer 2: Edge Score Framework — per-model scoring methodology
  - Layer 2: Model Evaluation Protocol — how each model evaluates the MSO

Output: JSON schemas for MSO and Edge Score, plus scoring calibration tables.
"""

import json
import os

OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research-engine/sprint062'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─── LAYER 1: MARKET STATE OBJECT SCHEMA ─────────────────────────────────────

MARKET_STATE_OBJECT = {
    "schema_version": "1.0",
    "description": "The complete, immutable snapshot of market conditions calculated on every completed 5-minute candle. This is the sole input to all execution model evaluators.",
    
    "fields": {
        
        # ── Temporal Context ──────────────────────────────────────────────────
        "ts_utc": {
            "type": "datetime",
            "description": "UTC timestamp of the completed candle close",
            "derivation": "bar_time",
            "pine_var": "time"
        },
        "ts_et": {
            "type": "datetime", 
            "description": "Eastern Time timestamp (accounts for DST)",
            "derivation": "bar_time converted to America/New_York",
            "pine_var": "timestamp('America/New_York', year, month, dayofmonth, hour, minute)"
        },
        "hour_et": {
            "type": "int",
            "range": [0, 23],
            "description": "Hour of day in Eastern Time",
            "pine_var": "hour(time, 'America/New_York')"
        },
        "minute_et": {
            "type": "int",
            "range": [0, 59],
            "description": "Minute of hour in Eastern Time",
            "pine_var": "minute(time, 'America/New_York')"
        },
        "day_of_week": {
            "type": "int",
            "range": [1, 7],
            "description": "Day of week (1=Monday, 7=Sunday)",
            "pine_var": "dayofweek"
        },
        
        # ── Session Classification ─────────────────────────────────────────────
        "session": {
            "type": "enum",
            "values": ["PRE_MARKET", "AM_OPEN", "AM_SESSION", "MID_SESSION", "PM_SESSION", "AFTER_HOURS", "OVERNIGHT"],
            "description": "Current trading session classification",
            "derivation": {
                "PRE_MARKET":  "04:00-09:29 ET",
                "AM_OPEN":     "09:30-10:00 ET (first 30 min — highest volatility)",
                "AM_SESSION":  "09:30-11:59 ET",
                "MID_SESSION": "12:00-13:59 ET (lunch lull)",
                "PM_SESSION":  "14:00-15:59 ET",
                "AFTER_HOURS": "16:00-17:59 ET",
                "OVERNIGHT":   "18:00-04:00 ET"
            },
            "pine_var": "custom_session_classifier()"
        },
        "is_rth": {
            "type": "bool",
            "description": "True if current bar is within Regular Trading Hours (09:30-16:00 ET)",
            "pine_var": "session.ismarket"
        },
        "mins_since_rth_open": {
            "type": "int",
            "description": "Minutes elapsed since 09:30 ET open (0 if not RTH)",
            "pine_var": "custom_mins_since_open()"
        },
        
        # ── Price Action ──────────────────────────────────────────────────────
        "close": {"type": "float", "description": "Current bar close price", "pine_var": "close"},
        "high":  {"type": "float", "description": "Current bar high", "pine_var": "high"},
        "low":   {"type": "float", "description": "Current bar low", "pine_var": "low"},
        "open":  {"type": "float", "description": "Current bar open", "pine_var": "open"},
        "volume": {"type": "int", "description": "Current bar volume", "pine_var": "volume"},
        "transactions": {
            "type": "int",
            "description": "Number of transactions (order flow fragmentation proxy) — MNQ tick data",
            "pine_var": "volume  // NOTE: Pine uses volume; transactions requires custom data feed"
        },
        
        # ── Trend Structure ───────────────────────────────────────────────────
        "ema_20": {
            "type": "float",
            "description": "20-period EMA of close",
            "pine_var": "ta.ema(close, 20)"
        },
        "ema_50": {
            "type": "float",
            "description": "50-period EMA of close",
            "pine_var": "ta.ema(close, 50)"
        },
        "ema_200": {
            "type": "float",
            "description": "200-period EMA of close",
            "pine_var": "ta.ema(close, 200)"
        },
        "ema_structure": {
            "type": "enum",
            "values": ["BULL_ALIGNED", "BEAR_ALIGNED", "MIXED"],
            "description": "EMA stack alignment: BULL if ema20>ema50>ema200, BEAR if ema20<ema50<ema200",
            "derivation": "if ema20>ema50>ema200: BULL_ALIGNED; elif ema20<ema50<ema200: BEAR_ALIGNED; else: MIXED",
            "pine_var": "custom_ema_structure()"
        },
        "price_vs_ema20": {
            "type": "float",
            "description": "Close minus EMA20, normalised by ATR14 (signed distance)",
            "derivation": "(close - ema_20) / atr_14",
            "pine_var": "(close - ta.ema(close,20)) / atr14"
        },
        
        # ── Momentum & Trend Strength ─────────────────────────────────────────
        "adx_14": {
            "type": "float",
            "range": [0, 100],
            "description": "14-period Average Directional Index",
            "pine_var": "ta.dmi(14, 14)[2]  // [di_plus, di_minus, adx]"
        },
        "di_plus": {
            "type": "float",
            "description": "+DI directional indicator",
            "pine_var": "ta.dmi(14, 14)[0]"
        },
        "di_minus": {
            "type": "float",
            "description": "-DI directional indicator",
            "pine_var": "ta.dmi(14, 14)[1]"
        },
        "adx_state": {
            "type": "enum",
            "values": ["WEAK_TREND", "DEVELOPING_TREND", "STRONG_TREND", "EXTREME_TREND"],
            "description": "ADX regime classification",
            "derivation": {
                "WEAK_TREND":       "ADX < 20",
                "DEVELOPING_TREND": "20 <= ADX < 30",
                "STRONG_TREND":     "30 <= ADX < 40",
                "EXTREME_TREND":    "ADX >= 40"
            }
        },
        "trend_direction": {
            "type": "enum",
            "values": ["BULLISH", "BEARISH", "NEUTRAL"],
            "description": "Directional bias from DI+ vs DI-",
            "derivation": "if di_plus > di_minus + 5: BULLISH; elif di_minus > di_plus + 5: BEARISH; else: NEUTRAL"
        },
        
        # ── Volatility ────────────────────────────────────────────────────────
        "atr_14": {
            "type": "float",
            "description": "14-period Average True Range (rolling, not EWM)",
            "pine_var": "ta.atr(14)"
        },
        "atr_ratio": {
            "type": "float",
            "description": "Current ATR14 / 20-period rolling mean of ATR14 (volatility expansion ratio)",
            "derivation": "atr_14 / ta.sma(ta.atr(14), 20)",
            "pine_var": "ta.atr(14) / ta.sma(ta.atr(14), 20)"
        },
        "volatility_state": {
            "type": "enum",
            "values": ["COMPRESSED", "NORMAL", "EXPANDING", "EXTREME"],
            "description": "Volatility regime classification",
            "derivation": {
                "COMPRESSED": "atr_ratio < 0.75",
                "NORMAL":     "0.75 <= atr_ratio < 1.25",
                "EXPANDING":  "1.25 <= atr_ratio < 1.75",
                "EXTREME":    "atr_ratio >= 1.75"
            }
        },
        
        # ── Participation ─────────────────────────────────────────────────────
        "rel_volume_20": {
            "type": "float",
            "description": "Current volume / 20-period SMA of volume (relative volume)",
            "pine_var": "volume / ta.sma(volume, 20)"
        },
        "rel_transactions_20": {
            "type": "float",
            "description": "Current transactions / 20-period SMA of transactions (order fragmentation ratio — MVC-003 key variable)",
            "pine_var": "transactions / ta.sma(transactions, 20)  // requires tick data feed"
        },
        "participation_state": {
            "type": "enum",
            "values": ["LOW", "NORMAL", "ELEVATED", "SURGE"],
            "description": "Participation classification based on relative volume/transactions",
            "derivation": {
                "LOW":      "rel_volume < 0.70",
                "NORMAL":   "0.70 <= rel_volume < 1.20",
                "ELEVATED": "1.20 <= rel_volume < 1.50",
                "SURGE":    "rel_volume >= 1.50"
            }
        },
        
        # ── Overnight Inventory ───────────────────────────────────────────────
        "ov_open": {
            "type": "float",
            "description": "Previous RTH close (overnight session opening reference price)",
            "derivation": "close of last RTH bar of prior session"
        },
        "ov_close": {
            "type": "float",
            "description": "Close of the last overnight bar before RTH open",
            "derivation": "close at 09:29 ET"
        },
        "ov_high": {
            "type": "float",
            "description": "Highest price during overnight session",
            "derivation": "max(high) from 18:00 ET to 09:29 ET"
        },
        "ov_low": {
            "type": "float",
            "description": "Lowest price during overnight session",
            "derivation": "min(low) from 18:00 ET to 09:29 ET"
        },
        "ov_range_pts": {
            "type": "float",
            "description": "Overnight range in absolute points",
            "derivation": "ov_high - ov_low"
        },
        "ov_range_vs_atr14": {
            "type": "float",
            "description": "Overnight range normalised by ATR14 (MVC-003 key variable)",
            "derivation": "ov_range_pts / atr_14"
        },
        "ov_return_vs_atr14": {
            "type": "float",
            "description": "Overnight directional return (ov_close - ov_open) normalised by ATR14",
            "derivation": "(ov_close - ov_open) / atr_14"
        },
        "ov_direction": {
            "type": "enum",
            "values": ["BULLISH", "BEARISH", "NEUTRAL"],
            "description": "Overnight directional bias (MVC-003 key variable)",
            "derivation": {
                "BULLISH": "ov_return_vs_atr14 > 0.10",
                "BEARISH": "ov_return_vs_atr14 < -0.10",
                "NEUTRAL": "-0.10 <= ov_return_vs_atr14 <= 0.10"
            }
        },
        "ov_range_state": {
            "type": "enum",
            "values": ["TIGHT", "NORMAL", "LARGE", "EXTREME"],
            "description": "Overnight range classification",
            "derivation": {
                "TIGHT":   "ov_range_vs_atr14 < 5.0",
                "NORMAL":  "5.0 <= ov_range_vs_atr14 < 10.0",
                "LARGE":   "10.0 <= ov_range_vs_atr14 < 15.0",
                "EXTREME": "ov_range_vs_atr14 >= 15.0"
            }
        },
        
        # ── Compression / Expansion ───────────────────────────────────────────
        "intraday_range_vs_atr14": {
            "type": "float",
            "description": "Current day's range (high-low) normalised by ATR14 (D-08 discovery variable)",
            "derivation": "(day_high - day_low) / atr_14"
        },
        "compression_state": {
            "type": "enum",
            "values": ["COMPRESSED", "NORMAL", "EXPANDING", "EXTENDED"],
            "description": "Intraday range expansion state",
            "derivation": {
                "COMPRESSED": "intraday_range_vs_atr14 < 0.50",
                "NORMAL":     "0.50 <= intraday_range_vs_atr14 < 1.00",
                "EXPANDING":  "1.00 <= intraday_range_vs_atr14 < 1.50",
                "EXTENDED":   "intraday_range_vs_atr14 >= 1.50"
            }
        },
        
        # ── MVC Signal States ─────────────────────────────────────────────────
        "mvc_001_active": {
            "type": "bool",
            "description": "MVC-001: High Relative Volume + Large Overnight Range + Bullish Overnight",
            "derivation": "rel_volume_20 >= 1.33 AND ov_range_vs_atr14 >= 10.85 AND ov_direction == BULLISH"
        },
        "mvc_002_active": {
            "type": "bool",
            "description": "MVC-002: AM Session + Large Overnight Range + Bullish Overnight",
            "derivation": "session in [AM_OPEN, AM_SESSION] AND ov_range_vs_atr14 >= 10.85 AND ov_direction == BULLISH"
        },
        "mvc_003_active": {
            "type": "bool",
            "description": "MVC-003: Participation Surge + Large Overnight Range + Bullish Overnight (B1 core signal)",
            "derivation": "rel_transactions_20 >= 1.33 AND ov_range_vs_atr14 >= 10.85 AND ov_direction == BULLISH"
        },
        "mvc_004_active": {
            "type": "bool",
            "description": "MVC-004: High ADX + Large Overnight Range + Bullish Overnight",
            "derivation": "adx_14 >= 35 AND ov_range_vs_atr14 >= 10.85 AND ov_direction == BULLISH"
        },
        "mvc_005_active": {
            "type": "bool",
            "description": "MVC-005: Participation Surge + Bullish Overnight + Expanding Intraday",
            "derivation": "rel_transactions_20 >= 1.33 AND ov_direction == BULLISH AND intraday_range_vs_atr14 >= 1.00"
        },
        "mvc_006_active": {
            "type": "bool",
            "description": "MVC-006: Large Overnight Range + Bullish Overnight + Expanding Intraday",
            "derivation": "ov_range_vs_atr14 >= 10.85 AND ov_direction == BULLISH AND intraday_range_vs_atr14 >= 1.00"
        },
        
        # ── Market Principle States ───────────────────────────────────────────
        "mp_001_regime_active": {
            "type": "bool",
            "description": "MP-001: Regime Dependence — EMA structure is aligned (not MIXED)",
            "derivation": "ema_structure != MIXED"
        },
        "mp_002_adx_sufficient": {
            "type": "bool",
            "description": "MP-002: ADX Thresholds — trend strength sufficient for directional models",
            "derivation": "adx_14 >= 25"
        },
        "mp_003_session_optimal": {
            "type": "bool",
            "description": "MP-003: Session Asymmetry — current session has historically positive expectancy",
            "derivation": "session in [AM_OPEN, AM_SESSION]"
        },
        "mp_004_volcomp_active": {
            "type": "bool",
            "description": "MP-004: VolComp→Expansion — volatility compression followed by expansion signal",
            "derivation": "volatility_state in [EXPANDING, EXTREME] AND atr_ratio > 1.25"
        },
        "mp_005_streak_clear": {
            "type": "bool",
            "description": "MP-005: Loss Streaks = Regime Transitions — ARI consecutive loss counter is clear (< 2)",
            "derivation": "ari_consecutive_losses < 2  // sourced from ARI state, not MSE"
        },
        
        # ── ARI State (read-only snapshot) ────────────────────────────────────
        "ari_consecutive_losses": {
            "type": "int",
            "description": "Number of consecutive portfolio losses (sourced from ARI, included in MSO for model awareness)",
            "range": [0, 99]
        },
        "ari_daily_pnl": {
            "type": "float",
            "description": "Current day's realised P&L across all models (sourced from ARI)",
        },
        "ari_active_position": {
            "type": "bool",
            "description": "True if any model currently has an open position",
        },
        "ari_circuit_breaker": {
            "type": "bool",
            "description": "True if ARI circuit breaker is engaged (no new trades permitted)",
        },
    }
}

# ─── LAYER 2: EDGE SCORE FRAMEWORK ───────────────────────────────────────────

EDGE_SCORE_FRAMEWORK = {
    "schema_version": "1.0",
    "description": "Standardised scoring methodology for all Atlas Execution Models. Every model returns a comparable Edge Score (0-100) enabling direct ranking by the ADE.",
    
    "components": {
        
        "C1_market_alignment": {
            "weight": 20,
            "description": "How well the current market structure aligns with the model's validated operating conditions",
            "sub_scores": {
                "ema_structure_match": "10 points if EMA structure matches model's historical win condition",
                "adx_range_match":     "10 points if ADX is within model's validated performance range"
            }
        },
        
        "C2_historical_expectancy": {
            "weight": 20,
            "description": "The model's validated expectancy in the current regime, interpolated from the research database",
            "sub_scores": {
                "regime_expectancy":  "10 points scaled by historical PF in current ADX/EMA regime",
                "session_expectancy": "10 points scaled by historical WR in current session"
            }
        },
        
        "C3_regime_match": {
            "weight": 20,
            "description": "Whether the current market regime matches the model's validated operating regime",
            "sub_scores": {
                "volatility_regime":  "10 points if volatility state matches model's validated range",
                "trend_regime":       "10 points if trend direction matches model's directional bias"
            }
        },
        
        "C4_session_match": {
            "weight": 15,
            "description": "Session compatibility with the model's validated time windows",
            "sub_scores": {
                "session_window":     "15 points if current session is within model's optimal window, 0 if outside"
            }
        },
        
        "C5_mvc_strength": {
            "weight": 15,
            "description": "Number and quality of active MVC signals supporting the model",
            "sub_scores": {
                "primary_mvc":        "10 points if the model's primary MVC is active",
                "supporting_mvc":     "5 points if one or more supporting MVCs are also active"
            }
        },
        
        "C6_behaviour_confidence": {
            "weight": 5,
            "description": "Confidence in the current signal based on recent model performance",
            "sub_scores": {
                "recent_performance": "5 points scaled by model's WR over last 10 trades (0 if < 30% WR)"
            }
        },
        
        "C7_production_reliability": {
            "weight": 5,
            "description": "Model's overall production track record (static, updated monthly)",
            "sub_scores": {
                "validated_pf":       "5 points scaled by model's validated Profit Factor (capped at PF=3.0)"
            }
        }
    },
    
    "activation_threshold": {
        "value": 60,
        "description": "A model must score >= 60 to be considered eligible. Below this threshold, the model is considered to have insufficient edge for capital allocation."
    },
    
    "model_calibration": {
        "A1": {
            "primary_mvc": None,
            "optimal_session": ["AM_SESSION", "PM_SESSION"],
            "optimal_adx_range": [20, 40],
            "optimal_ema_structure": "BULL_ALIGNED",
            "validated_pf": 1.387,
            "validated_wr": 0.54,
            "c7_score": 2.3  # (1.387/3.0) * 5
        },
        "A3": {
            "primary_mvc": "mvc_004_active",  # ADX + large OV range + bullish
            "optimal_session": ["AM_OPEN", "AM_SESSION"],
            "optimal_adx_range": [25, 60],
            "optimal_ema_structure": "BULL_ALIGNED",
            "validated_pf": 1.566,
            "validated_wr": 0.60,
            "c7_score": 2.6  # (1.566/3.0) * 5
        },
        "B1": {
            "primary_mvc": "mvc_003_active",  # Participation + large OV range + bullish
            "optimal_session": ["AM_OPEN", "AM_SESSION"],
            "optimal_adx_range": [25, 60],
            "optimal_ema_structure": "ANY",
            "validated_pf": 2.231,
            "validated_wr": 0.433,
            "c7_score": 3.7  # (2.231/3.0) * 5
        }
    },
    
    "ranking_rules": [
        "1. Only models with Edge Score >= activation_threshold are eligible",
        "2. If multiple models are eligible, the highest Edge Score wins",
        "3. In case of tie (within 2 points), the model with higher validated_pf wins",
        "4. If no model is eligible, Atlas does not trade (no-trade is a valid decision)",
        "5. The selected model becomes the Candidate Model and is passed to ARI"
    ]
}

# ─── LAYER 2: MODEL EVALUATION PROTOCOL ──────────────────────────────────────

MODEL_EVALUATION_PROTOCOL = {
    "schema_version": "1.0",
    "description": "The standard interface every execution model must implement to participate in ADE ranking.",
    
    "input": "Market State Object (MSO) — read-only, immutable",
    
    "output_schema": {
        "model_id": {"type": "string", "description": "Model identifier (A1, A3, B1, etc.)"},
        "eligible": {"type": "bool", "description": "True if model has a valid signal in current market state"},
        "edge_score": {"type": "float", "range": [0, 100], "description": "Composite edge score from the 7-component framework"},
        "expected_r": {"type": "float", "description": "Expected R-multiple for this trade setup (positive = expected win)"},
        "confidence": {"type": "enum", "values": ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"], "description": "Qualitative confidence tier"},
        "session_compatible": {"type": "bool", "description": "True if current session is within model's validated window"},
        "regime_compatible": {"type": "bool", "description": "True if current regime matches model's validated conditions"},
        "supporting_mvcs": {"type": "list[string]", "description": "List of active MVC IDs that support this model's signal"},
        "entry_price": {"type": "float", "description": "Proposed entry price (typically close of signal bar)"},
        "stop_price": {"type": "float", "description": "Proposed stop loss price"},
        "target_price": {"type": "float", "description": "Proposed target price"},
        "risk_pts": {"type": "float", "description": "Risk in points (entry - stop)"},
        "reward_pts": {"type": "float", "description": "Reward in points (target - entry)"},
        "rr_ratio": {"type": "float", "description": "Reward:Risk ratio"},
        "rejection_reason": {"type": "string", "description": "If not eligible, the primary reason for rejection"}
    },
    
    "isolation_rules": [
        "Each model receives ONLY the Market State Object",
        "Models must NOT access any other model's state or output",
        "Models must NOT access ARI state directly (ARI state is included in MSO as read-only fields)",
        "Models must NOT modify any global state",
        "Models must return their output within one bar (synchronous evaluation)"
    ]
}

# Save schemas
with open(f'{OUTPUT_DIR}/mso_schema.json', 'w') as f:
    json.dump(MARKET_STATE_OBJECT, f, indent=2)

with open(f'{OUTPUT_DIR}/edge_score_framework.json', 'w') as f:
    json.dump(EDGE_SCORE_FRAMEWORK, f, indent=2)

with open(f'{OUTPUT_DIR}/model_evaluation_protocol.json', 'w') as f:
    json.dump(MODEL_EVALUATION_PROTOCOL, f, indent=2)

print("=== MSE & ADE DESIGN COMPLETE ===")
print(f"  MSO fields: {len(MARKET_STATE_OBJECT['fields'])}")
print(f"  Edge Score components: {len(EDGE_SCORE_FRAMEWORK['components'])}")
print(f"  Activation threshold: {EDGE_SCORE_FRAMEWORK['activation_threshold']['value']}")
print(f"  Models calibrated: {list(EDGE_SCORE_FRAMEWORK['model_calibration'].keys())}")
print(f"  Output schema fields: {len(MODEL_EVALUATION_PROTOCOL['output_schema'])}")
