"""
Atlas Observatory Engine v1.0
Sprint 049 — Continuous Learning Layer

This module is the core of the Atlas Observatory. It ingests trade logs,
market data, and ARI decisions, then generates structured observations
classified by the Research Queue taxonomy.

PRODUCTION SAFETY: This module is READ-ONLY. It never modifies ATS v2.0.
"""

import json
import os
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import warnings
warnings.filterwarnings('ignore')

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

OBSERVATORY_DIR = Path(__file__).parent
DATA_DIR = OBSERVATORY_DIR / "data"
REPORTS_DIR = OBSERVATORY_DIR / "reports"
QUEUE_DIR = OBSERVATORY_DIR / "queue"
LOGS_DIR = OBSERVATORY_DIR / "logs"

# Historical baselines from validated backtests (ATS v2.0)
HISTORICAL_BASELINES = {
    "portfolio_pf": 1.405,
    "portfolio_win_rate": 0.535,
    "portfolio_monthly_consistency": 0.778,
    "a1_win_rate": 0.485,
    "a1_pf": 1.387,
    "a2_win_rate": 0.524,
    "a2_pf": 1.354,
    "a3_win_rate": 0.283,
    "a3_pf": 1.566,
    "avg_daily_trades": 1.35,
    "exceptional_move_threshold_r": 2.0,   # ≥2R = exceptional
    "missed_opp_threshold_r": 3.0,          # ≥3R missed = noteworthy
    "ari_intervention_rate": 0.306,         # 30.6% from Sprint 039
}

# Knowledge Confidence scores (initial values from validated research)
KNOWLEDGE_CONFIDENCE = {
    "regime_dependence": 0.95,
    "session_asymmetry": 0.90,
    "overnight_compression": 0.90,
    "structural_anchoring": 0.85,
    "static_level_failure": 0.80,
    "theory_of_edge": 0.88,
    "ari_edge": 0.85,
}

# Research Queue classification thresholds (sigma deviations)
CLASSIFICATION_THRESHOLDS = {
    "no_action": 1.0,
    "monitor": 2.0,
    "generate_hypothesis": 3.0,
    "immediate_priority": float('inf'),
}

# ─────────────────────────────────────────────────────────────────────────────
# DATA STRUCTURES
# ─────────────────────────────────────────────────────────────────────────────

class TradeRecord:
    """Represents a single completed or rejected trade."""
    def __init__(self, data: dict):
        self.date = data.get("date")
        self.model = data.get("model")
        self.session = data.get("session")
        self.direction = data.get("direction")
        self.entry = data.get("entry", 0)
        self.exit = data.get("exit", 0)
        self.pnl_points = data.get("pnl_points", 0)
        self.pnl_dollars = data.get("pnl_dollars", 0)
        self.risk_dollars = data.get("risk_dollars", 800)
        self.outcome = data.get("outcome")  # win/loss/rejected
        self.adx_at_entry = data.get("adx_at_entry", 0)
        self.atr_at_entry = data.get("atr_at_entry", 0)
        self.regime = data.get("regime")
        self.ari_intervention = data.get("ari_intervention", False)
        self.ari_rule = data.get("ari_rule")
        self.risk_multiplier = data.get("risk_multiplier", 1.0)
        self.r_multiple = self.pnl_dollars / self.risk_dollars if self.risk_dollars > 0 else 0


class Observation:
    """A classified observation from the Observatory engine."""
    def __init__(self, category: str, description: str, magnitude: float,
                 sigma_deviation: float, classification: str,
                 urs_pre_score: int = 0, knowledge_impact: dict = None,
                 recommended_action: str = "", date: str = None):
        self.date = date or datetime.now().strftime("%Y-%m-%d")
        self.category = category
        self.description = description
        self.magnitude = magnitude
        self.sigma_deviation = sigma_deviation
        self.classification = classification
        self.urs_pre_score = urs_pre_score
        self.knowledge_impact = knowledge_impact or {}
        self.recommended_action = recommended_action

    def to_dict(self) -> dict:
        return {
            "date": self.date,
            "category": self.category,
            "description": self.description,
            "magnitude": round(self.magnitude, 4),
            "sigma_deviation": round(self.sigma_deviation, 2),
            "classification": self.classification,
            "urs_pre_score": self.urs_pre_score,
            "knowledge_impact": self.knowledge_impact,
            "recommended_action": self.recommended_action,
        }


# ─────────────────────────────────────────────────────────────────────────────
# CORE ENGINE
# ─────────────────────────────────────────────────────────────────────────────

class ObservatoryEngine:
    """
    The Atlas Observatory Core Engine.
    Ingests trade logs and market data, generates classified observations.
    """

    def __init__(self, market_data_path: Optional[str] = None):
        self.baselines = HISTORICAL_BASELINES.copy()
        self.knowledge_confidence = KNOWLEDGE_CONFIDENCE.copy()
        self.observations: List[Observation] = []
        self.market_data = None

        if market_data_path:
            self._load_market_data(market_data_path)

        # Rolling statistics for drift detection
        self._rolling_pf_window = []
        self._rolling_win_rate_window = []
        self._rolling_trade_count_window = []

    def _load_market_data(self, path: str):
        """Load 5-minute MNQ market data for exceptional move detection."""
        try:
            df = pd.read_csv(path, parse_dates=['timestamp_et'])
            df = df.rename(columns={'timestamp_et': 'datetime'})
            df = df.sort_values('datetime').reset_index(drop=True)
            df['atr14'] = self._calc_atr(df, 14)
            df['adx14'] = self._calc_adx(df, 14)
            df['session'] = df['datetime'].apply(self._classify_session)
            self.market_data = df
        except Exception as e:
            print(f"[Observatory] Warning: Could not load market data: {e}")

    def _calc_atr(self, df: pd.DataFrame, period: int) -> pd.Series:
        high, low, close = df['high'], df['low'], df['close']
        prev_close = close.shift(1)
        tr = pd.concat([high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
        return tr.rolling(period).mean()

    def _calc_adx(self, df: pd.DataFrame, period: int) -> pd.Series:
        high, low, close = df['high'], df['low'], df['close']
        plus_dm = high.diff()
        minus_dm = -low.diff()
        plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0)
        minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0)
        atr = self._calc_atr(df, period)
        plus_di = 100 * (plus_dm.rolling(period).mean() / atr)
        minus_di = 100 * (minus_dm.rolling(period).mean() / atr)
        dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-10)
        return dx.rolling(period).mean()

    def _classify_session(self, dt) -> str:
        if hasattr(dt, 'hour'):
            h = dt.hour
            if 9 <= h < 12:
                return "am_session"
            elif 12 <= h < 14:
                return "midday"
            elif 14 <= h < 16:
                return "pm_session"
            elif h >= 18 or h < 9:
                return "overnight"
        return "unknown"

    def _classify_observation(self, sigma_deviation: float) -> str:
        """Classify an observation based on sigma deviation from baseline."""
        abs_sigma = abs(sigma_deviation)
        if abs_sigma < CLASSIFICATION_THRESHOLDS["no_action"]:
            return "No Action"
        elif abs_sigma < CLASSIFICATION_THRESHOLDS["monitor"]:
            return "Monitor"
        elif abs_sigma < CLASSIFICATION_THRESHOLDS["generate_hypothesis"]:
            return "Generate Hypothesis"
        else:
            return "Immediate Priority"

    def _pre_score_urs(self, category: str, description: str, sigma: float) -> int:
        """
        Pre-score a hypothesis using a simplified URS rubric.
        Returns a score 0-100 indicating research priority.
        """
        score = 0
        # Uncertainty reduction potential (0-30)
        if sigma > 3.0:
            score += 30
        elif sigma > 2.0:
            score += 20
        elif sigma > 1.5:
            score += 10

        # Category weight (0-25)
        category_weights = {
            "MO": 25,  # Missed opportunities = highest value
            "MS": 22,  # New market structure
            "MB": 18,  # Model behaviour anomaly
            "RS": 15,  # Rejected signal analysis
            "RT": 12,  # Regime transition
            "AD": 10,  # ARI decision
            "TE": 8,   # Trade execution
        }
        score += category_weights.get(category, 5)

        # Persistence bonus (0-20) — approximated by sigma magnitude
        if sigma > 2.5:
            score += 20
        elif sigma > 2.0:
            score += 12
        elif sigma > 1.5:
            score += 6

        # Testability (0-15) — all Observatory observations are testable
        score += 15

        # Novelty (0-10) — new categories get bonus
        if category in ["MS", "MO"]:
            score += 10
        else:
            score += 5

        return min(score, 100)

    # ─────────────────────────────────────────────────────────────────────────
    # ANALYSIS MODULES
    # ─────────────────────────────────────────────────────────────────────────

    def analyse_trade_execution(self, trades: List[TradeRecord], date: str) -> List[Observation]:
        """Analyse completed trades vs expected model behaviour."""
        observations = []
        if not trades:
            return observations

        completed = [t for t in trades if t.outcome in ["win", "loss"]]
        if not completed:
            return observations

        # Daily P&L vs expectation
        daily_pnl = sum(t.pnl_dollars for t in completed)
        daily_r = sum(t.r_multiple for t in completed)
        win_rate = sum(1 for t in completed if t.outcome == "win") / len(completed)

        # Check for unusual R-multiples
        for trade in completed:
            if abs(trade.r_multiple) > 4.0:
                sigma = (abs(trade.r_multiple) - 2.0) / 0.8  # baseline: mean=2R, std=0.8R
                obs = Observation(
                    category="TE",
                    description=f"Model {trade.model} produced {trade.r_multiple:.1f}R {trade.outcome} in {trade.session} session. ADX={trade.adx_at_entry:.1f}.",
                    magnitude=abs(trade.r_multiple),
                    sigma_deviation=sigma,
                    classification=self._classify_observation(sigma),
                    urs_pre_score=self._pre_score_urs("TE", "", sigma),
                    knowledge_impact={"theory_of_edge": +0.5 if trade.outcome == "win" else -0.3},
                    recommended_action=f"Investigate {trade.model} performance in {trade.session} at ADX={trade.adx_at_entry:.0f}.",
                    date=date
                )
                observations.append(obs)

        # Model-level win rate deviation
        for model_id in ["A1", "A2", "A3"]:
            model_trades = [t for t in completed if t.model == model_id]
            if len(model_trades) >= 3:
                model_wr = sum(1 for t in model_trades if t.outcome == "win") / len(model_trades)
                baseline_wr = self.baselines.get(f"{model_id.lower()}_win_rate", 0.5)
                if baseline_wr > 0:
                    sigma = (model_wr - baseline_wr) / (baseline_wr * 0.15)
                    if abs(sigma) > 1.0:
                        obs = Observation(
                            category="MB",
                            description=f"Model {model_id} win rate today: {model_wr:.1%} vs historical {baseline_wr:.1%} ({sigma:+.1f}σ). N={len(model_trades)}.",
                            magnitude=abs(model_wr - baseline_wr),
                            sigma_deviation=sigma,
                            classification=self._classify_observation(sigma),
                            urs_pre_score=self._pre_score_urs("MB", "", sigma),
                            knowledge_impact={f"{model_id.lower()}_edge": (model_wr - baseline_wr) * 100},
                            recommended_action=f"Monitor Model {model_id} win rate for 10 trading days." if abs(sigma) < 2 else f"Investigate Model {model_id} behaviour change.",
                            date=date
                        )
                        observations.append(obs)

        return observations

    def scan_missed_opportunities(self, market_data_day: pd.DataFrame, trades: List[TradeRecord], date: str) -> List[Observation]:
        """Identify exceptional moves that no Atlas model captured."""
        observations = []
        if market_data_day is None or market_data_day.empty:
            return observations

        atr_baseline = market_data_day['atr14'].median()
        if atr_baseline <= 0:
            return observations

        # Find large directional moves (≥3R equivalent)
        threshold_points = atr_baseline * 3.0
        window = 12  # 1 hour of 5-min bars

        for i in range(window, len(market_data_day)):
            segment = market_data_day.iloc[i-window:i]
            move = abs(segment['close'].iloc[-1] - segment['close'].iloc[0])
            if move >= threshold_points:
                direction = "up" if segment['close'].iloc[-1] > segment['close'].iloc[0] else "down"
                session = segment['session'].iloc[0] if 'session' in segment.columns else "unknown"
                r_equivalent = move / atr_baseline

                # Check if any model was active during this period
                model_active = any(
                    t.session == session and t.outcome in ["win", "loss"]
                    for t in trades
                )

                if not model_active:
                    sigma = (r_equivalent - 3.0) / 0.5
                    obs = Observation(
                        category="MO",
                        description=f"Missed {r_equivalent:.1f}R {direction} move in {session} session at {segment['datetime'].iloc[0].strftime('%H:%M')} ET. No Atlas model active.",
                        magnitude=r_equivalent,
                        sigma_deviation=sigma,
                        classification=self._classify_observation(sigma),
                        urs_pre_score=self._pre_score_urs("MO", "", sigma),
                        knowledge_impact={"session_asymmetry": -1.0 if session == "pm_session" else 0},
                        recommended_action=f"Investigate {session} {direction} breakout hypothesis. Consider H-B-{session[:2].upper()}01.",
                        date=date
                    )
                    observations.append(obs)
                    break  # One missed opportunity per session per day

        return observations

    def analyse_ari_decisions(self, trades: List[TradeRecord], date: str) -> List[Observation]:
        """Evaluate ARI intervention quality."""
        observations = []
        ari_trades = [t for t in trades if t.ari_intervention]
        non_ari_trades = [t for t in trades if not t.ari_intervention and t.outcome in ["win", "loss"]]

        if not ari_trades:
            return observations

        # Check if ARI blocked winners (Rule B rejection pattern)
        ari_rejected = [t for t in trades if t.outcome == "rejected" and t.ari_intervention]
        if ari_rejected:
            # Simulate what would have happened (requires market data)
            obs = Observation(
                category="AD",
                description=f"ARI rejected {len(ari_rejected)} trade(s) today. Rule: {ari_rejected[0].ari_rule}. Monitor for Rule B pattern (blocking high-expectancy recovery trades).",
                magnitude=len(ari_rejected),
                sigma_deviation=1.5,
                classification="Monitor",
                urs_pre_score=45,
                knowledge_impact={"ari_edge": -0.5},
                recommended_action="Track ARI rejection quality over 20 trading days.",
                date=date
            )
            observations.append(obs)

        return observations

    def detect_regime_transitions(self, market_data_day: pd.DataFrame, date: str) -> List[Observation]:
        """Detect significant regime changes (ADX/ATR transitions)."""
        observations = []
        if market_data_day is None or market_data_day.empty:
            return observations

        # Check for extreme ADX readings
        adx_values = market_data_day['adx14'].dropna()
        if len(adx_values) == 0:
            return observations

        max_adx = adx_values.max()
        min_adx = adx_values.min()

        # Historical ADX baseline: mean ~32, std ~12
        adx_mean, adx_std = 32.0, 12.0

        if max_adx > adx_mean + 2.5 * adx_std:
            sigma = (max_adx - adx_mean) / adx_std
            obs = Observation(
                category="RT",
                description=f"Extreme ADX reading today: {max_adx:.1f} ({sigma:.1f}σ above historical mean). Unusually strong trend regime. Model A3 and A2 conditions highly favourable.",
                magnitude=max_adx,
                sigma_deviation=sigma,
                classification=self._classify_observation(sigma),
                urs_pre_score=self._pre_score_urs("RT", "", sigma),
                knowledge_impact={"regime_dependence": +1.0},
                recommended_action="Monitor model performance in extreme ADX conditions. Consider ADX>60 sub-regime analysis.",
                date=date
            )
            observations.append(obs)

        if min_adx < adx_mean - 2.0 * adx_std:
            sigma = (adx_mean - min_adx) / adx_std
            obs = Observation(
                category="RT",
                description=f"Extremely low ADX today: {min_adx:.1f} ({sigma:.1f}σ below historical mean). Choppy/ranging regime. Model A1 conditions unfavourable.",
                magnitude=min_adx,
                sigma_deviation=-sigma,
                classification=self._classify_observation(sigma),
                urs_pre_score=self._pre_score_urs("RT", "", sigma),
                knowledge_impact={"regime_dependence": +0.5},
                recommended_action="Monitor A1 performance in low-ADX regimes. Validate ADX<20 filter effectiveness.",
                date=date
            )
            observations.append(obs)

        return observations

    def update_knowledge_confidence(self, observations: List[Observation]) -> Dict[str, float]:
        """Update Knowledge Confidence scores based on today's observations."""
        updates = {}
        for obs in observations:
            for truth, delta in obs.knowledge_impact.items():
                if truth in self.knowledge_confidence:
                    old_val = self.knowledge_confidence[truth]
                    # Bayesian-style update: small daily adjustments
                    adjustment = delta * 0.005  # 0.5% per sigma unit
                    new_val = max(0.10, min(0.99, old_val + adjustment))
                    self.knowledge_confidence[truth] = new_val
                    if abs(adjustment) > 0.001:
                        updates[truth] = {"old": old_val, "new": new_val, "delta": adjustment}
        return updates

    # ─────────────────────────────────────────────────────────────────────────
    # DAILY ANALYSIS RUNNER
    # ─────────────────────────────────────────────────────────────────────────

    def run_daily_analysis(self, trades: List[dict], market_data_day: Optional[pd.DataFrame] = None,
                           date: str = None) -> dict:
        """
        Run the full daily Observatory analysis.
        Returns a structured Daily Knowledge Report.
        """
        date = date or datetime.now().strftime("%Y-%m-%d")
        trade_records = [TradeRecord(t) for t in trades]

        all_observations = []

        # Run all analysis modules
        all_observations += self.analyse_trade_execution(trade_records, date)
        all_observations += self.scan_missed_opportunities(market_data_day, trade_records, date)
        all_observations += self.analyse_ari_decisions(trade_records, date)
        all_observations += self.detect_regime_transitions(market_data_day, date)

        # Update Knowledge Confidence
        confidence_updates = self.update_knowledge_confidence(all_observations)

        # Classify observations into Research Queue
        queue_summary = {
            "No Action": [],
            "Monitor": [],
            "Generate Hypothesis": [],
            "Immediate Priority": [],
        }
        for obs in all_observations:
            queue_summary[obs.classification].append(obs.to_dict())

        # Compute daily statistics
        completed_trades = [t for t in trade_records if t.outcome in ["win", "loss"]]
        daily_stats = {
            "total_trades": len(completed_trades),
            "wins": sum(1 for t in completed_trades if t.outcome == "win"),
            "losses": sum(1 for t in completed_trades if t.outcome == "loss"),
            "win_rate": sum(1 for t in completed_trades if t.outcome == "win") / max(len(completed_trades), 1),
            "net_pnl": sum(t.pnl_dollars for t in completed_trades),
            "total_r": sum(t.r_multiple for t in completed_trades),
            "ari_interventions": sum(1 for t in trade_records if t.ari_intervention),
            "models_active": list(set(t.model for t in completed_trades)),
        }

        # Answer the 9 Daily Questions
        daily_questions = self._answer_daily_questions(trade_records, all_observations, daily_stats)

        # Build the report
        report = {
            "date": date,
            "daily_stats": daily_stats,
            "daily_questions": daily_questions,
            "observations": [o.to_dict() for o in all_observations],
            "research_queue": queue_summary,
            "knowledge_confidence": self.knowledge_confidence.copy(),
            "confidence_updates": confidence_updates,
            "total_observations": len(all_observations),
            "queue_counts": {k: len(v) for k, v in queue_summary.items()},
        }

        # Store observations
        self.observations.extend(all_observations)

        return report

    def _answer_daily_questions(self, trades: List[TradeRecord], observations: List[Observation],
                                 stats: dict) -> dict:
        """Answer the 9 Observatory Daily Questions."""
        completed = [t for t in trades if t.outcome in ["win", "loss"]]

        # Q1: Did Atlas perform as expected?
        if stats["total_trades"] == 0:
            q1 = "No trades today. Market conditions did not trigger any model signals."
        elif stats["win_rate"] >= self.baselines["portfolio_win_rate"] * 0.8:
            q1 = f"Yes. Win rate {stats['win_rate']:.1%} is within expected range (historical: {self.baselines['portfolio_win_rate']:.1%})."
        else:
            q1 = f"Below expectation. Win rate {stats['win_rate']:.1%} vs historical {self.baselines['portfolio_win_rate']:.1%}. Monitor."

        # Q2: Did any model behave unusually?
        mb_obs = [o for o in observations if o.category == "MB"]
        q2 = f"Yes — {len(mb_obs)} model behaviour anomalies detected: " + "; ".join(o.description[:80] for o in mb_obs) if mb_obs else "No. All models behaved within expected parameters."

        # Q3: Did any model stop behaving normally?
        critical_mb = [o for o in mb_obs if o.classification in ["Generate Hypothesis", "Immediate Priority"]]
        q3 = f"ALERT: {len(critical_mb)} model(s) showing significant deviation from baseline." if critical_mb else "No. No models showing signs of regime breakdown."

        # Q4: Did ARI intervene correctly?
        ari_obs = [o for o in observations if o.category == "AD"]
        q4 = f"ARI made {stats['ari_interventions']} intervention(s) today. " + (ari_obs[0].description[:100] if ari_obs else "All interventions appear consistent with validated rules.")

        # Q5: Were there exceptional moves Atlas completely missed?
        mo_obs = [o for o in observations if o.category == "MO"]
        q5 = f"Yes — {len(mo_obs)} missed opportunity/opportunities detected: " + "; ".join(o.description[:80] for o in mo_obs) if mo_obs else "No. No significant untracked moves identified today."

        # Q6: Were there rejected trades that became major winners?
        rejected = [t for t in trades if t.outcome == "rejected"]
        q6 = f"{len(rejected)} trade(s) were rejected by ARI today. Outcome tracking requires next-bar data." if rejected else "No trades were rejected by ARI today."

        # Q7: Did the market exhibit a new structural behaviour?
        ms_obs = [o for o in observations if o.category in ["MS", "RT"]]
        q7 = f"Yes — {len(ms_obs)} structural/regime observation(s): " + "; ".join(o.description[:80] for o in ms_obs) if ms_obs else "No new structural behaviours detected. Market consistent with historical patterns."

        # Q8: Has any production assumption become weaker?
        negative_impacts = [o for o in observations if any(v < -0.5 for v in o.knowledge_impact.values())]
        q8 = f"Yes — {len(negative_impacts)} assumption(s) weakened today: " + "; ".join(o.description[:60] for o in negative_impacts) if negative_impacts else "No. All production assumptions remain intact."

        # Q9: Did today's market increase or decrease Atlas Knowledge Confidence?
        total_delta = sum(sum(v for v in o.knowledge_impact.values()) for o in observations)
        q9 = f"Increased (+{total_delta:.2f} aggregate confidence delta)." if total_delta > 0 else f"Decreased ({total_delta:.2f} aggregate confidence delta). Monitor for sustained decline." if total_delta < 0 else "Neutral. No significant confidence updates today."

        return {
            "q1_performance": q1,
            "q2_model_behaviour": q2,
            "q3_model_breakdown": q3,
            "q4_ari_quality": q4,
            "q5_missed_opportunities": q5,
            "q6_rejected_outcomes": q6,
            "q7_new_structure": q7,
            "q8_assumption_weakness": q8,
            "q9_knowledge_confidence": q9,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # WEEKLY DRIFT REPORT
    # ─────────────────────────────────────────────────────────────────────────

    def generate_weekly_drift_report(self, daily_reports: List[dict]) -> dict:
        """Generate a weekly drift analysis from 5 daily reports."""
        if not daily_reports:
            return {}

        # Aggregate weekly statistics
        all_trades_data = []
        all_observations = []
        for report in daily_reports:
            all_observations.extend(report.get("observations", []))

        # Compute weekly metrics
        total_trades = sum(r["daily_stats"]["total_trades"] for r in daily_reports)
        total_wins = sum(r["daily_stats"]["wins"] for r in daily_reports)
        total_pnl = sum(r["daily_stats"]["net_pnl"] for r in daily_reports)
        weekly_wr = total_wins / max(total_trades, 1)
        weekly_pf = None  # Requires gross profit/loss breakdown

        # Drift vs historical
        wr_drift = (weekly_wr - self.baselines["portfolio_win_rate"]) / self.baselines["portfolio_win_rate"]

        # Research queue summary
        queue_counts = {"No Action": 0, "Monitor": 0, "Generate Hypothesis": 0, "Immediate Priority": 0}
        for obs in all_observations:
            cls = obs.get("classification", "No Action")
            if cls in queue_counts:
                queue_counts[cls] += 1

        # Hypothesis candidates (Generate Hypothesis or higher)
        hypothesis_candidates = [o for o in all_observations
                                   if o.get("classification") in ["Generate Hypothesis", "Immediate Priority"]]
        hypothesis_candidates.sort(key=lambda x: x.get("urs_pre_score", 0), reverse=True)

        return {
            "week_start": daily_reports[0]["date"] if daily_reports else "",
            "week_end": daily_reports[-1]["date"] if daily_reports else "",
            "total_trades": total_trades,
            "weekly_win_rate": weekly_wr,
            "weekly_wr_drift": wr_drift,
            "weekly_pnl": total_pnl,
            "total_observations": len(all_observations),
            "research_queue_summary": queue_counts,
            "top_hypothesis_candidates": hypothesis_candidates[:5],
            "knowledge_confidence_end": self.knowledge_confidence.copy(),
            "drift_status": "STABLE" if abs(wr_drift) < 0.20 else "CAUTION" if abs(wr_drift) < 0.40 else "ALERT",
        }

    # ─────────────────────────────────────────────────────────────────────────
    # MONTHLY OPPORTUNITY REPORT
    # ─────────────────────────────────────────────────────────────────────────

    def generate_monthly_opportunity_report(self, weekly_reports: List[dict]) -> dict:
        """Generate a monthly opportunity report from 4 weekly reports."""
        if not weekly_reports:
            return {}

        # Aggregate all hypothesis candidates
        all_candidates = []
        for report in weekly_reports:
            all_candidates.extend(report.get("top_hypothesis_candidates", []))

        # Deduplicate and rank by URS pre-score
        seen = set()
        unique_candidates = []
        for c in all_candidates:
            key = c.get("category", "") + c.get("description", "")[:50]
            if key not in seen:
                seen.add(key)
                unique_candidates.append(c)

        unique_candidates.sort(key=lambda x: x.get("urs_pre_score", 0), reverse=True)

        # Monthly performance summary
        total_trades = sum(r.get("total_trades", 0) for r in weekly_reports)
        avg_wr = np.mean([r.get("weekly_win_rate", 0) for r in weekly_reports if r.get("total_trades", 0) > 0]) if weekly_reports else 0

        return {
            "month": weekly_reports[0].get("week_start", "")[:7] if weekly_reports else "",
            "total_trades": total_trades,
            "average_weekly_win_rate": avg_wr,
            "total_hypothesis_candidates": len(unique_candidates),
            "top_research_opportunities": unique_candidates[:10],
            "recommended_next_sprint": unique_candidates[0].get("recommended_action", "No high-priority opportunities identified.") if unique_candidates else "Continue monitoring.",
            "knowledge_confidence_month_end": self.knowledge_confidence.copy(),
        }

    # ─────────────────────────────────────────────────────────────────────────
    # REPORT PERSISTENCE
    # ─────────────────────────────────────────────────────────────────────────

    def save_report(self, report: dict, report_type: str, date: str):
        """Save a report to the Observatory reports directory."""
        filename = REPORTS_DIR / f"atlas_observatory_{report_type}_{date}.json"
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2, default=str)
        return str(filename)

    def save_research_queue(self, queue_items: List[dict]):
        """Append high-priority items to the persistent Research Queue."""
        queue_file = QUEUE_DIR / "atlas_research_queue.json"
        existing = []
        if queue_file.exists():
            with open(queue_file) as f:
                existing = json.load(f)

        # Add new items (avoid duplicates by description)
        existing_descriptions = {item.get("description", "")[:60] for item in existing}
        for item in queue_items:
            if item.get("description", "")[:60] not in existing_descriptions:
                item["added_date"] = datetime.now().strftime("%Y-%m-%d")
                item["status"] = "pending"
                existing.append(item)

        with open(queue_file, 'w') as f:
            json.dump(existing, f, indent=2, default=str)


# ─────────────────────────────────────────────────────────────────────────────
# DEMO RUNNER — generates a sample daily report using historical MNQ data
# ─────────────────────────────────────────────────────────────────────────────

def run_demo(data_path: str, output_dir: str = None):
    """
    Run the Observatory on a sample of historical MNQ data to demonstrate
    the full pipeline and generate the first Daily Knowledge Report.
    """
    print("=" * 70)
    print("ATLAS OBSERVATORY ENGINE v1.0 — DEMO RUN")
    print("=" * 70)

    # Load market data
    engine = ObservatoryEngine(market_data_path=data_path)
    print(f"[Observatory] Market data loaded: {len(engine.market_data):,} bars")

    # Simulate 5 trading days of ATS v2.0 output using historical data
    df = engine.market_data
    # Ensure datetime is properly parsed (handle timezone-aware strings)
    if not pd.api.types.is_datetime64_any_dtype(df['datetime']):
        df['datetime'] = pd.to_datetime(df['datetime'], utc=True).dt.tz_convert('America/New_York')
    df['date'] = df['datetime'].dt.date

    # Pick 5 representative trading days
    trading_days = sorted(df['date'].unique())
    sample_days = trading_days[-30:-25]  # 5 days from recent history

    daily_reports = []
    for day in sample_days:
        day_data = df[df['date'] == day].copy()
        if len(day_data) < 20:
            continue

        # Simulate realistic ATS v2.0 trade output for this day
        simulated_trades = _simulate_day_trades(day_data, str(day))

        # Run daily analysis
        report = engine.run_daily_analysis(
            trades=simulated_trades,
            market_data_day=day_data,
            date=str(day)
        )
        daily_reports.append(report)

        print(f"\n[{day}] Trades: {report['daily_stats']['total_trades']} | "
              f"WR: {report['daily_stats']['win_rate']:.1%} | "
              f"P&L: ${report['daily_stats']['net_pnl']:,.0f} | "
              f"Observations: {report['total_observations']} | "
              f"Queue: {report['queue_counts']}")

        # Print daily questions summary
        dq = report['daily_questions']
        print(f"  Q1 (Performance): {dq['q1_performance'][:80]}")
        print(f"  Q5 (Missed Opps): {dq['q5_missed_opportunities'][:80]}")
        print(f"  Q9 (Knowledge):   {dq['q9_knowledge_confidence'][:80]}")

    # Generate weekly report
    if daily_reports:
        weekly = engine.generate_weekly_drift_report(daily_reports)
        print(f"\n{'='*70}")
        print("WEEKLY DRIFT REPORT")
        print(f"{'='*70}")
        print(f"Trades: {weekly['total_trades']} | WR Drift: {weekly['weekly_wr_drift']:+.1%} | Status: {weekly['drift_status']}")
        print(f"Research Queue: {weekly['research_queue_summary']}")
        if weekly['top_hypothesis_candidates']:
            print(f"Top Hypothesis: {weekly['top_hypothesis_candidates'][0].get('description', '')[:100]}")

    # Save all reports
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        for report in daily_reports:
            engine.save_report(report, "daily", report["date"])

        if daily_reports:
            engine.save_report(weekly, "weekly", daily_reports[-1]["date"])

        # Save research queue
        all_queue_items = []
        for report in daily_reports:
            for cls in ["Generate Hypothesis", "Immediate Priority"]:
                all_queue_items.extend(report["research_queue"].get(cls, []))
        if all_queue_items:
            engine.save_research_queue(all_queue_items)

    print(f"\n[Observatory] Final Knowledge Confidence:")
    for truth, conf in engine.knowledge_confidence.items():
        print(f"  {truth}: {conf:.1%}")

    return daily_reports, engine


def _simulate_day_trades(day_data: pd.DataFrame, date: str) -> List[dict]:
    """Simulate realistic ATS v2.0 trade output for a given day."""
    trades = []
    atr = day_data['atr14'].median()
    adx = day_data['adx14'].median()
    if atr <= 0 or adx <= 0:
        return trades

    # Model A3: overnight trade (if ADX > 25)
    if adx > 25:
        overnight = day_data[day_data['session'] == 'overnight']
        if len(overnight) > 5:
            entry = overnight['close'].iloc[5]
            direction = "long" if overnight['close'].iloc[-1] > overnight['open'].iloc[0] else "short"
            r_mult = np.random.choice([-1, -1, 1, 1, 1, 2, 3], p=[0.25, 0.25, 0.15, 0.15, 0.1, 0.07, 0.03])
            pnl = r_mult * 800
            trades.append({
                "date": date, "model": "A3", "session": "overnight",
                "direction": direction, "entry": entry,
                "exit": entry + (atr * r_mult * (1 if direction == "long" else -1)),
                "pnl_points": atr * r_mult, "pnl_dollars": pnl,
                "risk_dollars": 800, "outcome": "win" if r_mult > 0 else "loss",
                "adx_at_entry": adx, "atr_at_entry": atr,
                "regime": "high_adx" if adx > 30 else "low_adx",
                "ari_intervention": np.random.random() < 0.15,
                "ari_rule": "consecutive_loss" if np.random.random() < 0.15 else None,
                "risk_multiplier": 1.0
            })

    # Model A1: PM session trade (if ADX < 30)
    if adx < 30:
        pm = day_data[day_data['session'] == 'pm_session']
        if len(pm) > 5:
            entry = pm['close'].iloc[5]
            direction = "long" if pm['close'].iloc[-1] > pm['open'].iloc[0] else "short"
            r_mult = np.random.choice([-1, 1, 1, 2], p=[0.515, 0.25, 0.15, 0.085])
            pnl = r_mult * 800
            trades.append({
                "date": date, "model": "A1", "session": "pm_session",
                "direction": direction, "entry": entry,
                "exit": entry + (atr * r_mult * (1 if direction == "long" else -1)),
                "pnl_points": atr * r_mult, "pnl_dollars": pnl,
                "risk_dollars": 800, "outcome": "win" if r_mult > 0 else "loss",
                "adx_at_entry": adx, "atr_at_entry": atr,
                "regime": "low_adx",
                "ari_intervention": False, "ari_rule": None, "risk_multiplier": 1.0
            })

    return trades


if __name__ == "__main__":
    import sys
    data_path = "/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv"
    output_dir = "/home/ubuntu/Project-Atlas/observatory/reports"
    daily_reports, engine = run_demo(data_path, output_dir)
    print(f"\n[Observatory] Demo complete. Reports saved to {output_dir}")
