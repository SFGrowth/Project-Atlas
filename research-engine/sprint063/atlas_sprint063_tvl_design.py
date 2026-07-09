"""
Atlas Sprint 063 — Trade Verification Layer (TVL) Design

Formalises the complete TVL specification:
  - 6 validation categories with exact rules and rejection codes
  - TVL state machine (VERIFIED / REJECTED / DELAYED / EMERGENCY BLOCK)
  - Implementation layer classification (Pine / Webhook / TradersPost / External)
  - Observatory audit schema
"""

import json, os

OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research-engine/sprint063'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─── TVL STATE MACHINE ────────────────────────────────────────────────────────

TVL_STATE_MACHINE = {
    "states": {
        "PENDING":          "TVL has received the ARI-approved trade and is running validations",
        "VERIFIED":         "All 6 validation categories passed. Webhook may be transmitted.",
        "REJECTED":         "One or more validation rules failed. Webhook must NOT be transmitted. Record in Observatory.",
        "DELAYED":          "Validation cannot be completed yet (e.g., waiting for bar close confirmation). Retry on next bar.",
        "EMERGENCY_BLOCK":  "A critical safety condition detected (e.g., duplicate position, broker disconnect). All trading halted until manual review."
    },
    "transitions": [
        {"from": "PENDING",         "to": "VERIFIED",         "condition": "All 6 categories pass"},
        {"from": "PENDING",         "to": "REJECTED",         "condition": "Any non-critical rule fails"},
        {"from": "PENDING",         "to": "DELAYED",          "condition": "Bar not yet confirmed (barstate.isrealtime == false)"},
        {"from": "PENDING",         "to": "EMERGENCY_BLOCK",  "condition": "Critical safety condition detected"},
        {"from": "DELAYED",         "to": "PENDING",          "condition": "Next bar close — re-evaluate"},
        {"from": "EMERGENCY_BLOCK", "to": "PENDING",          "condition": "Manual reset only"},
        {"from": "REJECTED",        "to": "PENDING",          "condition": "New signal on subsequent bar"},
        {"from": "VERIFIED",        "to": "PENDING",          "condition": "New signal on subsequent bar"}
    ],
    "rule": "Only VERIFIED state may result in webhook transmission. All other states must suppress execution."
}

# ─── TVL VALIDATION CATEGORIES ───────────────────────────────────────────────

TVL_VALIDATION_CATEGORIES = {

    "C1_execution_model": {
        "description": "Verify the execution model identity and eligibility",
        "failure_action": "REJECTED",
        "rules": {
            "C1-01": {
                "name": "Valid Model ID",
                "check": "model_id in ['A1', 'A3', 'B1']",
                "rejection_code": "TVL-C1-01",
                "rejection_reason": "Unknown or unregistered model ID",
                "implementation": "Pine Script",
                "critical": True
            },
            "C1-02": {
                "name": "Model Currently Promoted",
                "check": "model_id in PROMOTED_MODELS (static list, updated each sprint)",
                "rejection_code": "TVL-C1-02",
                "rejection_reason": "Model is not in the current promoted models registry",
                "implementation": "Pine Script",
                "critical": True
            },
            "C1-03": {
                "name": "Model Eligible in Current Market State",
                "check": "model.eligible == true (from ADE evaluation output)",
                "rejection_code": "TVL-C1-03",
                "rejection_reason": "Model was not marked eligible by ADE on this bar",
                "implementation": "Pine Script",
                "critical": True
            },
            "C1-04": {
                "name": "Model Selected by ADE",
                "check": "model_id == ade_selected_model_id",
                "rejection_code": "TVL-C1-04",
                "rejection_reason": "Model ID in trade does not match ADE-selected model",
                "implementation": "Pine Script",
                "critical": True
            },
            "C1-05": {
                "name": "Edge Score Above Activation Threshold",
                "check": "edge_score >= 60",
                "rejection_code": "TVL-C1-05",
                "rejection_reason": "Edge score below activation threshold of 60",
                "implementation": "Pine Script",
                "critical": False
            }
        }
    },

    "C2_market_state": {
        "description": "Verify the market state has not materially changed since ADE evaluation",
        "failure_action": "REJECTED",
        "rules": {
            "C2-01": {
                "name": "Current Bar Unchanged",
                "check": "barstate.isrealtime == true (not a historical replay)",
                "rejection_code": "TVL-C2-01",
                "rejection_reason": "Bar is not a live real-time bar — possible TradingView replay or restart",
                "implementation": "Pine Script",
                "critical": True,
                "note": "This is the most important Pine guard. barstate.isrealtime prevents historical alerts."
            },
            "C2-02": {
                "name": "Session Still Valid",
                "check": "current_session == signal_session (session has not changed since signal generation)",
                "rejection_code": "TVL-C2-02",
                "rejection_reason": "Session changed between signal generation and TVL verification",
                "implementation": "Pine Script",
                "critical": False
            },
            "C2-03": {
                "name": "Regime Unchanged",
                "check": "abs(current_adx - signal_adx) <= 3.0 (ADX has not shifted materially)",
                "rejection_code": "TVL-C2-03",
                "rejection_reason": "ADX regime changed materially (>3 points) since signal generation",
                "implementation": "Pine Script",
                "critical": False
            },
            "C2-04": {
                "name": "Trading Window Still Open",
                "check": "hour_et < 15 OR (hour_et == 15 AND minute_et < 30)",
                "rejection_code": "TVL-C2-04",
                "rejection_reason": "Trading window has closed (after 15:30 ET)",
                "implementation": "Pine Script",
                "critical": True
            },
            "C2-05": {
                "name": "Market State Object Integrity",
                "check": "mso.ts_utc == current_bar_time (MSO was computed on this bar, not a stale snapshot)",
                "rejection_code": "TVL-C2-05",
                "rejection_reason": "MSO timestamp does not match current bar — stale state detected",
                "implementation": "Pine Script",
                "critical": True
            },
            "C2-06": {
                "name": "Price Reasonableness",
                "check": "abs(entry_price - close) / close < 0.005 (entry within 0.5% of current close)",
                "rejection_code": "TVL-C2-06",
                "rejection_reason": "Entry price deviates more than 0.5% from current close — possible data error",
                "implementation": "Pine Script + Webhook",
                "critical": False
            }
        }
    },

    "C3_ari_state": {
        "description": "Re-verify all ARI rules at the moment of transmission (final ARI check)",
        "failure_action": "REJECTED",
        "note": "These checks duplicate ARI rules intentionally. The TVL performs an independent re-verification.",
        "rules": {
            "C3-01": {
                "name": "Daily Loss Limit",
                "check": "ari_daily_pnl > -2000 (live) / -1500 (prop)",
                "rejection_code": "TVL-C3-01",
                "rejection_reason": "Daily loss limit reached between ARI approval and TVL verification",
                "implementation": "Pine Script",
                "critical": True
            },
            "C3-02": {
                "name": "Consecutive Loss Rule",
                "check": "ari_consecutive_losses < 2",
                "rejection_code": "TVL-C3-02",
                "rejection_reason": "Consecutive loss count changed between ARI approval and TVL verification",
                "implementation": "Pine Script",
                "critical": True
            },
            "C3-03": {
                "name": "Circuit Breaker",
                "check": "ari_circuit_breaker == false",
                "rejection_code": "TVL-C3-03",
                "rejection_reason": "ARI circuit breaker is active",
                "implementation": "Pine Script",
                "critical": True,
                "failure_action_override": "EMERGENCY_BLOCK"
            },
            "C3-04": {
                "name": "Daily Trade Count",
                "check": "ari_daily_trade_count < 3",
                "rejection_code": "TVL-C3-04",
                "rejection_reason": "Daily trade limit (3) already reached",
                "implementation": "Pine Script",
                "critical": True
            },
            "C3-05": {
                "name": "Active Position Check",
                "check": "ari_active_position == false",
                "rejection_code": "TVL-C3-05",
                "rejection_reason": "An active position exists — only one position per instrument permitted",
                "implementation": "Pine Script + Webhook",
                "critical": True,
                "failure_action_override": "EMERGENCY_BLOCK"
            },
            "C3-06": {
                "name": "Risk Multiplier Sanity",
                "check": "0.25 <= ari_risk_multiplier <= 2.0",
                "rejection_code": "TVL-C3-06",
                "rejection_reason": "Risk multiplier outside valid range [0.25, 2.0]",
                "implementation": "Pine Script",
                "critical": False
            }
        }
    },

    "C4_trade_parameters": {
        "description": "Verify all trade parameters are mathematically valid and internally consistent",
        "failure_action": "REJECTED",
        "rules": {
            "C4-01": {
                "name": "Entry Price Valid",
                "check": "entry_price > 0 AND entry_price is not na",
                "rejection_code": "TVL-C4-01",
                "rejection_reason": "Entry price is zero, negative, or undefined",
                "implementation": "Pine Script",
                "critical": True
            },
            "C4-02": {
                "name": "Stop Price Valid",
                "check": "stop_price > 0 AND stop_price != entry_price AND (direction==LONG: stop_price < entry_price) AND (direction==SHORT: stop_price > entry_price)",
                "rejection_code": "TVL-C4-02",
                "rejection_reason": "Stop price is invalid, equal to entry, or on wrong side of entry",
                "implementation": "Pine Script",
                "critical": True
            },
            "C4-03": {
                "name": "Target Price Valid",
                "check": "target_price > 0 AND target_price != entry_price AND (direction==LONG: target_price > entry_price) AND (direction==SHORT: target_price < entry_price)",
                "rejection_code": "TVL-C4-03",
                "rejection_reason": "Target price is invalid, equal to entry, or on wrong side of entry",
                "implementation": "Pine Script",
                "critical": True
            },
            "C4-04": {
                "name": "Risk Points Consistent",
                "check": "abs(risk_pts - abs(entry_price - stop_price)) < 0.5 (within 0.5 points of calculated risk)",
                "rejection_code": "TVL-C4-04",
                "rejection_reason": "Risk points in payload do not match entry/stop calculation",
                "implementation": "Pine Script + Webhook",
                "critical": True
            },
            "C4-05": {
                "name": "Contract Quantity Valid",
                "check": "contracts >= 1 AND contracts <= 10 AND contracts is integer",
                "rejection_code": "TVL-C4-05",
                "rejection_reason": "Contract quantity is zero, fractional, or exceeds hard cap of 10",
                "implementation": "Pine Script",
                "critical": True
            },
            "C4-06": {
                "name": "Risk Dollars Consistent",
                "check": "abs(risk_dollars - (contracts * risk_pts * 2.0)) < 10 (within $10 of calculated risk)",
                "rejection_code": "TVL-C4-06",
                "rejection_reason": "Risk dollars in payload do not match contracts × risk_pts × point_value",
                "implementation": "Pine Script + Webhook",
                "critical": False
            },
            "C4-07": {
                "name": "R Multiple Valid",
                "check": "rr_ratio >= 1.5 (minimum acceptable reward:risk)",
                "rejection_code": "TVL-C4-07",
                "rejection_reason": "Reward:Risk ratio below minimum threshold of 1.5",
                "implementation": "Pine Script",
                "critical": False
            },
            "C4-08": {
                "name": "Order Direction Valid",
                "check": "direction in ['LONG', 'SHORT']",
                "rejection_code": "TVL-C4-08",
                "rejection_reason": "Order direction is undefined or invalid",
                "implementation": "Pine Script",
                "critical": True
            },
            "C4-09": {
                "name": "Stop Distance Minimum",
                "check": "risk_pts >= 0.5 * atr_14 (stop is at least 50% of ATR14 — prevents stop too tight)",
                "rejection_code": "TVL-C4-09",
                "rejection_reason": "Stop distance is less than 50% of ATR14 — stop is too tight for current volatility",
                "implementation": "Pine Script",
                "critical": False
            }
        }
    },

    "C5_duplicate_prevention": {
        "description": "Verify this is not a duplicate or replayed signal",
        "failure_action": "REJECTED",
        "rules": {
            "C5-01": {
                "name": "Unique Signal ID",
                "check": "signal_id not in signal_id_cache (60-second rolling cache)",
                "rejection_code": "TVL-C5-01",
                "rejection_reason": "Signal ID already processed within the last 60 seconds — duplicate detected",
                "implementation": "Webhook Receiver",
                "critical": True
            },
            "C5-02": {
                "name": "Current Bar Not Already Traded",
                "check": "last_trade_bar_index != current_bar_index",
                "rejection_code": "TVL-C5-02",
                "rejection_reason": "A trade was already taken on this bar — one trade per bar maximum",
                "implementation": "Pine Script",
                "critical": True
            },
            "C5-03": {
                "name": "No Pending Webhook",
                "check": "webhook_pending_flag == false",
                "rejection_code": "TVL-C5-03",
                "rejection_reason": "A webhook transmission is already in progress for this signal",
                "implementation": "Webhook Receiver",
                "critical": True
            },
            "C5-04": {
                "name": "No Pending Order",
                "check": "broker_pending_order == false (no unacknowledged order at broker)",
                "rejection_code": "TVL-C5-04",
                "rejection_reason": "An unacknowledged order exists at the broker",
                "implementation": "TradersPost",
                "critical": True
            },
            "C5-05": {
                "name": "Duplicate JSON Payload",
                "check": "sha256(payload) not in payload_hash_cache (5-minute rolling cache)",
                "rejection_code": "TVL-C5-05",
                "rejection_reason": "Identical JSON payload received within the last 5 minutes",
                "implementation": "Webhook Receiver",
                "critical": True
            },
            "C5-06": {
                "name": "Position Reconciliation",
                "check": "pine_position_size == broker_position_size (Pine and broker agree on position state)",
                "rejection_code": "TVL-C5-06",
                "rejection_reason": "Pine Script position state does not match broker position — reconciliation required",
                "implementation": "TradersPost + External",
                "critical": True,
                "failure_action_override": "EMERGENCY_BLOCK"
            }
        }
    },

    "C6_broker_safety": {
        "description": "Verify broker connectivity and payload integrity before transmission",
        "failure_action": "DELAYED",
        "note": "C6 failures result in DELAYED (not REJECTED) because they are transient infrastructure issues, not logical errors. The signal remains valid; transmission is deferred.",
        "rules": {
            "C6-01": {
                "name": "Trading Session Open",
                "check": "broker_session_status == 'OPEN'",
                "rejection_code": "TVL-C6-01",
                "rejection_reason": "Broker reports trading session is not open",
                "implementation": "TradersPost",
                "critical": False,
                "failure_action_override": "DELAYED"
            },
            "C6-02": {
                "name": "Symbol Matches",
                "check": "payload.ticker == configured_symbol (e.g., 'MNQ1!')",
                "rejection_code": "TVL-C6-02",
                "rejection_reason": "Ticker symbol in payload does not match configured instrument",
                "implementation": "Webhook Receiver",
                "critical": True
            },
            "C6-03": {
                "name": "Account Available",
                "check": "traderspost_account_status == 'ACTIVE'",
                "rejection_code": "TVL-C6-03",
                "rejection_reason": "TradersPost account is not active or has been suspended",
                "implementation": "TradersPost",
                "critical": True,
                "failure_action_override": "EMERGENCY_BLOCK"
            },
            "C6-04": {
                "name": "Broker Connected",
                "check": "tradovate_connection_status == 'CONNECTED'",
                "rejection_code": "TVL-C6-04",
                "rejection_reason": "Tradovate broker connection is not active",
                "implementation": "TradersPost",
                "critical": False,
                "failure_action_override": "DELAYED"
            },
            "C6-05": {
                "name": "Webhook Payload Valid",
                "check": "all required fields present AND all types correct",
                "rejection_code": "TVL-C6-05",
                "rejection_reason": "Webhook payload is missing required fields or has type errors",
                "implementation": "Webhook Receiver",
                "critical": True
            },
            "C6-06": {
                "name": "JSON Schema Valid",
                "check": "payload validates against ADE webhook_payload_schema v1.0",
                "rejection_code": "TVL-C6-06",
                "rejection_reason": "JSON payload does not conform to the registered schema",
                "implementation": "Webhook Receiver",
                "critical": True
            }
        }
    }
}

# ─── IMPLEMENTATION LAYER CLASSIFICATION ─────────────────────────────────────

IMPLEMENTATION_CLASSIFICATION = {
    "Pine Script": {
        "description": "Executed inside TradingView Pine Script on every bar close",
        "capabilities": "Access to all OHLCV data, indicators, strategy state (position_size, etc.), barstate flags",
        "limitations": "Cannot make external HTTP calls. Cannot access broker state directly. Cannot persist state across sessions without var declarations.",
        "rules": ["C1-01", "C1-02", "C1-03", "C1-04", "C1-05",
                  "C2-01", "C2-02", "C2-03", "C2-04", "C2-05", "C2-06",
                  "C3-01", "C3-02", "C3-03", "C3-04", "C3-05", "C3-06",
                  "C4-01", "C4-02", "C4-03", "C4-04", "C4-05", "C4-06", "C4-07", "C4-08", "C4-09",
                  "C5-02"]
    },
    "Webhook Receiver": {
        "description": "Executed by the webhook endpoint before passing to TradersPost",
        "capabilities": "Full access to payload, can maintain state (signal_id cache, payload hash cache), can make HTTP calls",
        "limitations": "Cannot access TradingView Pine state directly. Cannot query broker positions directly.",
        "rules": ["C5-01", "C5-03", "C5-05", "C6-02", "C6-05", "C6-06"]
    },
    "TradersPost": {
        "description": "Executed by TradersPost before routing to Tradovate",
        "capabilities": "Access to broker connection status, account status, pending orders",
        "limitations": "Cannot access Pine Script state. Relies on payload data for signal context.",
        "rules": ["C5-04", "C6-01", "C6-03", "C6-04"]
    },
    "External Atlas Service": {
        "description": "A future external service (e.g., Atlas Monitor) that reconciles Pine and broker state",
        "capabilities": "Can query both TradingView (via REST API) and Tradovate simultaneously",
        "limitations": "Requires additional infrastructure. Not available in current production setup.",
        "rules": ["C5-06"],
        "interim_solution": "For now, C5-06 is handled by TradersPost position query + manual reconciliation if mismatch detected"
    }
}

# ─── OBSERVATORY AUDIT SCHEMA ─────────────────────────────────────────────────

TVL_OBSERVATORY_RECORD = {
    "record_type": "TVL_VERIFICATION",
    "fields": {
        "ts_utc":               "UTC timestamp of verification",
        "signal_id":            "Unique signal identifier",
        "model_id":             "Execution model that generated the signal",
        "ade_edge_score":       "Edge score from ADE evaluation",
        "ari_decision":         "ARI decision (APPROVED/REJECTED/etc.)",
        "tvl_result":           "Final TVL result (VERIFIED/REJECTED/DELAYED/EMERGENCY_BLOCK)",
        "categories_passed":    "List of validation categories that passed",
        "categories_failed":    "List of validation categories that failed",
        "rejection_codes":      "List of specific rejection codes (e.g., TVL-C2-01)",
        "rejection_reasons":    "Human-readable rejection reasons",
        "verification_time_ms": "Time taken to complete all validations (milliseconds)",
        "webhook_transmitted":  "True if webhook was sent (only possible if VERIFIED)",
        "broker_acknowledged":  "True if broker confirmed order receipt",
        "final_execution":      "True if order was filled at broker",
        "audit_hash":           "SHA256 of the complete record for tamper detection"
    },
    "retention": "Permanent",
    "access": "Read-only"
}

# Save all specifications
with open(f'{OUTPUT_DIR}/tvl_validation_categories.json', 'w') as f:
    json.dump(TVL_VALIDATION_CATEGORIES, f, indent=2)

with open(f'{OUTPUT_DIR}/tvl_state_machine.json', 'w') as f:
    json.dump(TVL_STATE_MACHINE, f, indent=2)

with open(f'{OUTPUT_DIR}/tvl_implementation_classification.json', 'w') as f:
    json.dump(IMPLEMENTATION_CLASSIFICATION, f, indent=2)

with open(f'{OUTPUT_DIR}/tvl_observatory_record.json', 'w') as f:
    json.dump(TVL_OBSERVATORY_RECORD, f, indent=2)

# Summary
total_rules = sum(len(cat['rules']) for cat in TVL_VALIDATION_CATEGORIES.values())
pine_rules = len(IMPLEMENTATION_CLASSIFICATION['Pine Script']['rules'])
webhook_rules = len(IMPLEMENTATION_CLASSIFICATION['Webhook Receiver']['rules'])
tp_rules = len(IMPLEMENTATION_CLASSIFICATION['TradersPost']['rules'])
ext_rules = len(IMPLEMENTATION_CLASSIFICATION['External Atlas Service']['rules'])

print("=== TVL DESIGN COMPLETE ===")
print(f"  Total validation rules: {total_rules}")
print(f"  Validation categories: {len(TVL_VALIDATION_CATEGORIES)}")
print(f"  Pine Script rules: {pine_rules}")
print(f"  Webhook Receiver rules: {webhook_rules}")
print(f"  TradersPost rules: {tp_rules}")
print(f"  External Service rules: {ext_rules}")
print(f"  TVL states: {len(TVL_STATE_MACHINE['states'])}")
print(f"  Observatory record fields: {len(TVL_OBSERVATORY_RECORD['fields'])}")

# Count critical rules
critical = sum(
    1 for cat in TVL_VALIDATION_CATEGORIES.values()
    for rule in cat['rules'].values()
    if rule.get('critical', False)
)
print(f"  Critical rules (EMERGENCY_BLOCK on failure): {critical}")
