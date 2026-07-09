"""
Atlas Sprint 062 — ARI, Execution Engine & Observatory Design

Formalises the complete specification for:
  - Layer 3: Atlas Risk Intelligence (ARI) — capital allocation decision engine
  - Layer 4: Execution Engine — TradingView → Webhook → TradersPost → Tradovate pipeline
  - Layer 5: Observatory — immutable production evidence log
"""

import json, os

OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research-engine/sprint062'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─── LAYER 3: ATLAS RISK INTELLIGENCE (ARI) ──────────────────────────────────

ARI_SPECIFICATION = {
    "schema_version": "1.0",
    "description": "ARI is the sole capital allocation authority. It receives the Candidate Model from the ADE and decides whether, and at what size, to allocate capital. ARI never modifies model signals; it only approves, rejects, or resizes.",
    
    "inputs": {
        "candidate_model": "The highest-ranked eligible model from the ADE (Model Evaluation Output)",
        "ari_state": "ARI's own persistent internal state (see state schema below)"
    },
    
    "state_schema": {
        "consecutive_losses": {
            "type": "int",
            "description": "Number of consecutive losses across all models since last win",
            "reset_condition": "Any winning trade resets to 0",
            "increment_condition": "Any losing trade (stop hit) increments by 1"
        },
        "daily_pnl": {
            "type": "float",
            "description": "Realised P&L for the current trading day (resets at 18:00 ET)",
            "reset_condition": "New trading day (18:00 ET)"
        },
        "daily_trade_count": {
            "type": "int",
            "description": "Number of trades taken today across all models",
            "reset_condition": "New trading day"
        },
        "active_position": {
            "type": "bool",
            "description": "True if any model currently has an open position"
        },
        "active_model_id": {
            "type": "string",
            "description": "ID of the model currently holding a position (null if none)"
        },
        "drawdown_from_peak": {
            "type": "float",
            "description": "Current drawdown from the all-time equity peak (negative number)"
        },
        "equity_peak": {
            "type": "float",
            "description": "Highest recorded equity value"
        },
        "risk_multiplier": {
            "type": "float",
            "description": "Current risk scaling factor (1.0 = base risk, 0.5 = half risk, 2.0 = double risk)",
            "default": 1.0
        },
        "circuit_breaker_active": {
            "type": "bool",
            "description": "True if ARI circuit breaker is engaged — no new trades permitted"
        },
        "circuit_breaker_reset_time": {
            "type": "datetime",
            "description": "Time at which circuit breaker automatically resets (if applicable)"
        }
    },
    
    "rules": {
        
        "R1_active_position_block": {
            "priority": 1,
            "condition": "ari_state.active_position == True",
            "action": "REJECT",
            "reason": "One active position per instrument at all times. No new entries until current position is closed.",
            "override": "None — this rule is absolute"
        },
        
        "R2_circuit_breaker": {
            "priority": 2,
            "condition": "ari_state.circuit_breaker_active == True",
            "action": "REJECT",
            "reason": "ARI circuit breaker is engaged. No new trades permitted.",
            "override": "Manual reset only"
        },
        
        "R3_daily_loss_limit": {
            "priority": 3,
            "condition": "ari_state.daily_pnl <= -2000",
            "action": "REJECT",
            "reason": "Daily loss limit of -$2,000 reached. No new trades today.",
            "override": "Resets at 18:00 ET",
            "prop_firm_variant": "For prop firm accounts, limit is -$1,500 (tighter)"
        },
        
        "R4_consecutive_loss_caution": {
            "priority": 4,
            "condition": "ari_state.consecutive_losses >= 2",
            "action": "REJECT",
            "reason": "ARI Caution: 2+ consecutive losses indicate potential regime transition. Pausing until next winning trade.",
            "override": "Resets on next winning trade",
            "research_basis": "Sprint 052 FS-A2-01: consecutive losses are footprints of regime transitions"
        },
        
        "R5_daily_trade_limit": {
            "priority": 5,
            "condition": "ari_state.daily_trade_count >= 3",
            "action": "REJECT",
            "reason": "Maximum 3 trades per day reached.",
            "override": "Resets at 18:00 ET"
        },
        
        "R6_drawdown_reduction": {
            "priority": 6,
            "condition": "ari_state.drawdown_from_peak <= -5000",
            "action": "REDUCED_RISK",
            "risk_multiplier": 0.5,
            "reason": "Drawdown exceeds $5,000 from peak. Risk reduced to 50% until recovery.",
            "recovery_condition": "drawdown_from_peak recovers to > -2500"
        },
        
        "R7_profit_compounding": {
            "priority": 7,
            "condition": "ari_state.daily_pnl >= 2000",
            "action": "INCREASED_RISK",
            "risk_multiplier": 1.25,
            "reason": "Daily P&L exceeds +$2,000. Risk increased to 125% for remainder of session.",
            "cap": "Maximum risk_multiplier = 2.0"
        },
        
        "R8_session_end_block": {
            "priority": 8,
            "condition": "hour_et >= 15 AND minute_et >= 30",
            "action": "REJECT",
            "reason": "No new entries within 30 minutes of session close (15:30 ET).",
            "override": "None"
        }
    },
    
    "capital_allocation": {
        "base_risk_live": 800,
        "base_risk_prop": 400,
        "description": "Base risk per trade in USD. Actual risk = base_risk * risk_multiplier.",
        "contract_sizing": "contracts = max(1, round(actual_risk / (risk_pts * point_value)))",
        "point_value_mnq": 2.0
    },
    
    "output_schema": {
        "decision": {
            "type": "enum",
            "values": ["APPROVED", "REJECTED", "REDUCED_RISK", "INCREASED_RISK"],
            "description": "ARI's capital allocation decision"
        },
        "approved_model_id": {"type": "string", "description": "Model ID if approved, null if rejected"},
        "contracts": {"type": "int", "description": "Number of contracts to trade (0 if rejected)"},
        "actual_risk": {"type": "float", "description": "Actual dollar risk for this trade"},
        "risk_multiplier": {"type": "float", "description": "Applied risk multiplier"},
        "rejection_reason": {"type": "string", "description": "Primary rejection reason if not approved"},
        "applied_rule": {"type": "string", "description": "ARI rule ID that determined the outcome"}
    }
}

# ─── LAYER 4: EXECUTION ENGINE ────────────────────────────────────────────────

EXECUTION_ENGINE_SPECIFICATION = {
    "schema_version": "1.0",
    "description": "The Execution Engine translates ARI-approved trade decisions into live broker orders via the TradingView → Webhook → TradersPost → Tradovate pipeline.",
    
    "pipeline": [
        {
            "step": 1,
            "component": "TradingView Pine Strategy",
            "responsibility": "Implements all 5 ADE layers in Pine Script. Generates alerts when ARI approves a trade.",
            "output": "TradingView Alert with JSON payload"
        },
        {
            "step": 2,
            "component": "TradingView Alert",
            "responsibility": "Fires the webhook when the strategy generates a signal",
            "output": "HTTP POST to webhook URL",
            "format": "JSON payload (see webhook_payload_schema below)"
        },
        {
            "step": 3,
            "component": "Webhook Receiver",
            "responsibility": "Receives and validates the alert payload. Routes to TradersPost.",
            "validation": [
                "Verify payload signature/token",
                "Check for duplicate alert (same signal within 30 seconds = duplicate)",
                "Validate all required fields are present",
                "Confirm position is not already open"
            ]
        },
        {
            "step": 4,
            "component": "TradersPost",
            "responsibility": "Translates the Atlas signal into broker-specific order instructions. Routes to multiple accounts.",
            "capabilities": [
                "Multiple account routing (prop account 1, prop account 2, live account)",
                "Order type translation (market, limit, stop)",
                "Position size per account",
                "Reverse position handling"
            ]
        },
        {
            "step": 5,
            "component": "Tradovate",
            "responsibility": "Executes the order in the futures market",
            "instruments": ["MNQ (Micro Nasdaq Futures)"],
            "order_types": ["Market", "Stop", "Limit"]
        },
        {
            "step": 6,
            "component": "Multiple Prop Accounts",
            "responsibility": "Receives identical orders routed from TradersPost",
            "account_types": ["FTMO", "TopStep", "Apex", "Live Account"]
        }
    ],
    
    "webhook_payload_schema": {
        "description": "The JSON payload sent by TradingView to the webhook on every trade signal",
        "fields": {
            "action": {
                "type": "string",
                "values": ["buy", "sell", "close_long", "close_short"],
                "description": "Trade action"
            },
            "ticker": {
                "type": "string",
                "example": "MNQ1!",
                "description": "TradingView ticker symbol"
            },
            "model_id": {
                "type": "string",
                "example": "B1",
                "description": "Atlas model that generated the signal"
            },
            "edge_score": {
                "type": "float",
                "description": "ADE edge score at time of signal"
            },
            "contracts": {
                "type": "int",
                "description": "Number of contracts approved by ARI"
            },
            "entry_price": {
                "type": "float",
                "description": "Signal bar close price"
            },
            "stop_price": {
                "type": "float",
                "description": "Stop loss price"
            },
            "target_price": {
                "type": "float",
                "description": "Target price"
            },
            "risk_pts": {
                "type": "float",
                "description": "Risk in points"
            },
            "signal_id": {
                "type": "string",
                "description": "Unique signal identifier (timestamp + model_id hash) for duplicate prevention"
            },
            "account_type": {
                "type": "string",
                "values": ["LIVE", "PROP"],
                "description": "Account type routing instruction"
            }
        },
        "example": {
            "action": "buy",
            "ticker": "MNQ1!",
            "model_id": "B1",
            "edge_score": 78.5,
            "contracts": 2,
            "entry_price": 21450.50,
            "stop_price": 21420.25,
            "target_price": 21540.75,
            "risk_pts": 30.25,
            "signal_id": "B1_20260709_093500_7a3f",
            "account_type": "PROP"
        }
    },
    
    "safety_rules": {
        "SR1_one_position_per_instrument": {
            "description": "Only one open position per instrument at any time",
            "implementation": "Pine Script: strategy.position_size check before entry",
            "webhook_check": "TradersPost: reject if position already open"
        },
        "SR2_duplicate_prevention": {
            "description": "Identical signal_id within 30 seconds is treated as a duplicate and rejected",
            "implementation": "Webhook receiver maintains a 60-second signal_id cache"
        },
        "SR3_tradingview_restart_recovery": {
            "description": "On TradingView restart, Pine Script re-evaluates current state without generating historical alerts",
            "implementation": "Use barstate.isrealtime guard on all alert() calls"
        },
        "SR4_internet_interruption": {
            "description": "If webhook fails to receive alert, no order is placed (fail-safe, not fail-open)",
            "implementation": "TradingView alerts have retry logic; broker positions checked on reconnect"
        },
        "SR5_broker_disconnection": {
            "description": "If Tradovate connection drops, TradersPost queues orders until reconnection",
            "implementation": "TradersPost handles reconnection; manual reconciliation if queue exceeds 5 minutes"
        },
        "SR6_alert_validation": {
            "description": "Every webhook payload is validated against the schema before processing",
            "implementation": "Required fields check, type validation, price sanity check (entry within 0.5% of last price)"
        },
        "SR7_position_reconciliation": {
            "description": "Every 5 minutes, ARI state is reconciled against actual broker positions",
            "implementation": "TradersPost position query → compare against Pine Script strategy.position_size"
        },
        "SR8_emergency_shutdown": {
            "description": "Manual kill switch that closes all positions and disables all alerts immediately",
            "implementation": "TradingView: disable all alerts; TradersPost: close all positions; Pine Script: strategy.close_all()"
        },
        "SR9_order_size_cap": {
            "description": "Maximum 10 contracts per order regardless of ARI risk multiplier",
            "implementation": "Hard cap in Pine Script and TradersPost"
        }
    },
    
    "multi_account_routing": {
        "description": "TradersPost routes identical signals to multiple accounts with account-specific sizing",
        "routing_rules": [
            "Live account: full ARI-approved size",
            "Prop account 1: reduced size (50% of live) with tighter daily loss limit (-$1,500)",
            "Prop account 2: same as prop account 1",
            "All accounts receive identical entry/stop/target prices"
        ],
        "account_independence": "Each prop account is treated as an independent entity. A loss on one account does not affect ARI state for other accounts."
    }
}

# ─── LAYER 5: OBSERVATORY ─────────────────────────────────────────────────────

OBSERVATORY_SPECIFICATION = {
    "schema_version": "1.0",
    "description": "The Observatory is the immutable production evidence log. It records every production decision and outcome. It is strictly read-only — it never modifies production behaviour. Its purpose is to enable post-hoc analysis, model improvement, and system auditing.",
    
    "record_types": {
        
        "MARKET_STATE_SNAPSHOT": {
            "trigger": "Every completed 5-minute RTH candle",
            "fields": ["ts_utc", "session", "adx_14", "atr_14", "volatility_state", "ema_structure", 
                       "ov_direction", "ov_range_vs_atr14", "participation_state", "all_mvc_states",
                       "all_mp_states"],
            "retention": "90 days rolling"
        },
        
        "ADE_EVALUATION": {
            "trigger": "Every bar where at least one model is evaluated",
            "fields": ["ts_utc", "models_evaluated", "edge_scores", "eligible_models", 
                       "selected_model", "rejection_reasons", "no_trade_reason"],
            "retention": "180 days rolling"
        },
        
        "ARI_DECISION": {
            "trigger": "Every time ARI receives a Candidate Model",
            "fields": ["ts_utc", "candidate_model_id", "ari_decision", "applied_rule", 
                       "contracts", "actual_risk", "risk_multiplier", "ari_state_snapshot"],
            "retention": "365 days"
        },
        
        "TRADE_ENTRY": {
            "trigger": "On every approved trade entry",
            "fields": ["ts_utc", "signal_id", "model_id", "edge_score", "entry_price", 
                       "stop_price", "target_price", "contracts", "risk_pts", "rr_ratio",
                       "market_state_at_entry", "ari_state_at_entry"],
            "retention": "Permanent"
        },
        
        "TRADE_EXIT": {
            "trigger": "On every trade close",
            "fields": ["ts_utc", "signal_id", "model_id", "exit_price", "exit_reason",
                       "pnl", "r_multiple", "bars_held", "market_state_at_exit"],
            "retention": "Permanent"
        },
        
        "MISSED_OPPORTUNITY": {
            "trigger": "When a model is eligible but ARI rejects the trade",
            "fields": ["ts_utc", "model_id", "edge_score", "rejection_reason", "hypothetical_outcome"],
            "description": "Tracks what would have happened if ARI had approved the trade — enables ARI rule calibration",
            "retention": "365 days"
        },
        
        "EXCEPTIONAL_BEHAVIOUR": {
            "trigger": "When any metric exceeds 2 standard deviations from its rolling mean",
            "fields": ["ts_utc", "metric_name", "metric_value", "rolling_mean", "z_score", "context"],
            "description": "Flags unusual market conditions or model behaviour for review",
            "retention": "365 days"
        },
        
        "CIRCUIT_BREAKER_EVENT": {
            "trigger": "On every circuit breaker activation or deactivation",
            "fields": ["ts_utc", "event_type", "trigger_rule", "ari_state_at_trigger", "manual_override"],
            "retention": "Permanent"
        }
    },
    
    "access_policy": {
        "write": "Production system only — no manual writes",
        "read": "Observatory dashboard, research scripts, post-hoc analysis",
        "modification": "PROHIBITED — records are immutable once written",
        "deletion": "Only via retention policy (automated)"
    },
    
    "dashboard_metrics": [
        "Live P&L by model and portfolio",
        "Rolling PF (7-day, 30-day, 90-day) per model",
        "ARI rejection rate by rule",
        "Missed opportunity P&L (hypothetical)",
        "Edge Score distribution over time",
        "Regime state frequency",
        "MVC activation frequency",
        "Circuit breaker frequency"
    ]
}

# Save all specifications
with open(f'{OUTPUT_DIR}/ari_specification.json', 'w') as f:
    json.dump(ARI_SPECIFICATION, f, indent=2)

with open(f'{OUTPUT_DIR}/execution_engine_specification.json', 'w') as f:
    json.dump(EXECUTION_ENGINE_SPECIFICATION, f, indent=2)

with open(f'{OUTPUT_DIR}/observatory_specification.json', 'w') as f:
    json.dump(OBSERVATORY_SPECIFICATION, f, indent=2)

print("=== ARI, EXECUTION ENGINE & OBSERVATORY DESIGN COMPLETE ===")
print(f"  ARI rules: {len(ARI_SPECIFICATION['rules'])}")
print(f"  ARI state fields: {len(ARI_SPECIFICATION['state_schema'])}")
print(f"  Execution pipeline steps: {len(EXECUTION_ENGINE_SPECIFICATION['pipeline'])}")
print(f"  Webhook payload fields: {len(EXECUTION_ENGINE_SPECIFICATION['webhook_payload_schema']['fields'])}")
print(f"  Safety rules: {len(EXECUTION_ENGINE_SPECIFICATION['safety_rules'])}")
print(f"  Observatory record types: {len(OBSERVATORY_SPECIFICATION['record_types'])}")
