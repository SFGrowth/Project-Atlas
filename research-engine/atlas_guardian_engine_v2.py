"""
Atlas Guardian Risk Intelligence Engine v0.2
Sprint 020b — 2026-07-07

Guardian is a Risk Intelligence Engine, not simply a rule engine.
It computes six independent component scores, aggregates them into an
Overall Risk Score (0–100), and produces a structured report with a
plain-language reason for every decision.

Critically, Guardian proves its own value by comparing performance
across every decision state (PASS / REDUCE RISK / PAPER ONLY / BLOCK).
If Guardian is genuinely improving Atlas, PASS trades must demonstrate
materially better robustness than trades Guardian rejected.
"""

import pandas as pd
import numpy as np
import logging
import warnings
from pathlib import Path

warnings.filterwarnings('ignore')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/tmp/guardian_v2_output.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS (Frozen Regime Engine v1.0 parameters — DO NOT CHANGE)
# ─────────────────────────────────────────────────────────────────────────────
FAST_ATR_LEN    = 5
SLOW_ATR_LEN    = 20
COMPRESS_THRESH = 0.7
EXPAND_THRESH   = 1.1
VWAP_THRESH     = 1.5

# Guardian thresholds
PASS_THRESHOLD        = 75
REDUCE_RISK_THRESHOLD = 50
PAPER_THRESHOLD       = 30

# Trade simulation parameters
ATR_STOP_MULT = 1.0
ATR_TP_MULT   = 2.0
POINT_VALUE   = 2.0  # MNQ: $2 per point


class GuardianRiskIntelligenceEngine:
    """
    Guardian v0.2 — Risk Intelligence Engine.
    Computes six component scores, an Overall Risk Score, and a structured
    decision report. Proves its own value by comparing performance across
    all four decision states.
    """

    def __init__(self, data_path: str):
        self.data_path = Path(data_path)
        self.df = None

    # ─────────────────────────────────────────────────────────────────────
    # DATA LOADING
    # ─────────────────────────────────────────────────────────────────────
    def load_data(self):
        logger.info(f"Loading data from {self.data_path}...")
        self.df = pd.read_csv(self.data_path)

        ts_col = 'timestamp_et' if 'timestamp_et' in self.df.columns else 'time'
        self.df['time'] = pd.to_datetime(self.df[ts_col], utc=True)
        self.df = self.df.sort_values('time').reset_index(drop=True)
        logger.info(f"Loaded {len(self.df):,} rows | {self.df['time'].min()} → {self.df['time'].max()}")

    # ─────────────────────────────────────────────────────────────────────
    # FROZEN REGIME ENGINE v1.0 COMPUTATIONS
    # ─────────────────────────────────────────────────────────────────────
    def compute_regime_inputs(self):
        logger.info("Computing frozen Regime Engine v1.0 inputs...")
        df = self.df

        df['tr'] = np.maximum(
            df['high'] - df['low'],
            np.maximum(
                abs(df['high'] - df['close'].shift(1)),
                abs(df['low']  - df['close'].shift(1))
            )
        )
        df['fast_atr'] = df['tr'].rolling(FAST_ATR_LEN).mean()
        df['slow_atr'] = df['tr'].rolling(SLOW_ATR_LEN).mean()
        df['atr_ratio'] = np.where(df['slow_atr'] > 0, df['fast_atr'] / df['slow_atr'], 1.0)
        df['atr_14']    = df['tr'].rolling(14).mean()

        # VWAP (session-reset)
        df['date']      = df['time'].dt.date
        df['hlc3']      = (df['high'] + df['low'] + df['close']) / 3
        df['vol_price'] = df['hlc3'] * df['volume']
        df['cum_vp']    = df.groupby('date')['vol_price'].cumsum()
        df['cum_vol']   = df.groupby('date')['volume'].cumsum()
        df['vwap']      = np.where(df['cum_vol'] > 0, df['cum_vp'] / df['cum_vol'], df['close'])
        df['vwap_dev']  = np.where(df['atr_14'] > 0, abs(df['close'] - df['vwap']) / df['atr_14'], 0)

        df['is_compressed'] = df['atr_ratio'] <= COMPRESS_THRESH
        df['is_expanded']   = df['atr_ratio'] >= EXPAND_THRESH
        df['is_good_loc']   = df['vwap_dev']  <= VWAP_THRESH

    # ─────────────────────────────────────────────────────────────────────
    # SIX COMPONENT SCORES
    # ─────────────────────────────────────────────────────────────────────
    def compute_component_scores(self):
        logger.info("Computing six Guardian component scores...")
        df = self.df

        # 1. MARKET REGIME SCORE (0–100)
        # Compression = 100, Expansion = 60, Neutral = 30
        df['regime_score'] = np.where(df['is_compressed'], 100,
                             np.where(df['is_expanded'],   60, 30))

        # 2. CONFIDENCE SCORE (0–100)
        # Based on VWAP proximity — closer = higher confidence
        # vwap_dev 0 = 100, vwap_dev 1.5 = 50, vwap_dev 3+ = 0
        df['confidence_score'] = np.clip(100 - (df['vwap_dev'] / 3.0) * 100, 0, 100).round(0)

        # 3. VOLATILITY SCORE (0–100)
        # ATR ratio near 1.0 = healthy (100), extremes = lower
        # Ratio 0.7–1.1 = 80–100, outside = scaled down
        atr_distance_from_ideal = abs(df['atr_ratio'] - 0.9)
        df['volatility_score'] = np.clip(100 - atr_distance_from_ideal * 80, 0, 100).round(0)

        # 4. SESSION SCORE (0–100)
        df['hour_et']   = df['time'].dt.tz_convert('America/New_York').dt.hour
        df['minute_et'] = df['time'].dt.tz_convert('America/New_York').dt.minute
        df['time_dec']  = df['hour_et'] + df['minute_et'] / 60.0

        df['is_rth']      = (df['time_dec'] >= 9.5)  & (df['time_dec'] < 16.0)
        df['is_opening']  = (df['time_dec'] >= 9.5)  & (df['time_dec'] < 10.0)
        df['is_lunch']    = (df['time_dec'] >= 12.0) & (df['time_dec'] < 13.5)
        df['is_power_hr'] = (df['time_dec'] >= 14.0) & (df['time_dec'] < 16.0)

        df['session_score'] = np.where(~df['is_rth'],      0,
                              np.where(df['is_opening'],   40,
                              np.where(df['is_lunch'],     50,
                              np.where(df['is_power_hr'],  90, 80))))

        # 5. DRAWDOWN HEALTH SCORE (0–100)
        # Proxy: rolling 5-bar return vs ATR. Severe recent loss = lower score.
        df['recent_return'] = df['close'] - df['close'].shift(5)
        df['drawdown_health'] = np.clip(
            100 + (df['recent_return'] / (df['slow_atr'] * 3)) * 50, 0, 100
        ).round(0)

        # 6. DAILY RISK SCORE (0–100)
        # Proxy: daily cumulative return. Negative day = lower score.
        df['daily_open'] = df.groupby('date')['open'].transform('first')
        df['daily_return'] = df['close'] - df['daily_open']
        df['daily_risk_score'] = np.clip(
            100 + (df['daily_return'] / (df['slow_atr'] * 5)) * 50, 0, 100
        ).round(0)

    # ─────────────────────────────────────────────────────────────────────
    # OVERALL RISK SCORE & GUARDIAN DECISION
    # ─────────────────────────────────────────────────────────────────────
    def compute_guardian_decision(self):
        logger.info("Computing Overall Risk Score and Guardian decisions...")
        df = self.df

        # Weighted aggregate (weights reflect importance to survival)
        # Market Regime: 25%, Confidence: 15%, Volatility: 15%,
        # Session: 20%, Drawdown Health: 15%, Daily Risk: 10%
        df['overall_risk_score'] = (
            df['regime_score']      * 0.25 +
            df['confidence_score']  * 0.15 +
            df['volatility_score']  * 0.15 +
            df['session_score']     * 0.20 +
            df['drawdown_health']   * 0.15 +
            df['daily_risk_score']  * 0.10
        ).round(0)

        # Guardian Decision
        df['guardian_decision'] = np.where(
            ~df['is_rth'],                                    0,  # BLOCK
            np.where(df['overall_risk_score'] < PAPER_THRESHOLD,  1,  # PAPER ONLY
            np.where(df['overall_risk_score'] < REDUCE_RISK_THRESHOLD, 2,  # REDUCE RISK
            np.where(df['overall_risk_score'] < PASS_THRESHOLD,  2,  # REDUCE RISK
            3)))  # PASS
        )

        # Plain-language reason
        def build_reason(row):
            if not row['is_rth']:
                return "Outside Regular Trading Hours"
            reasons = []
            if row['regime_score'] >= 90:
                reasons.append("Strong regime")
            elif row['regime_score'] <= 30:
                reasons.append("Poor regime")
            if row['confidence_score'] >= 80:
                reasons.append("High confidence location")
            elif row['confidence_score'] <= 40:
                reasons.append("Poor price location")
            if row['session_score'] >= 80:
                reasons.append("Optimal session")
            elif row['session_score'] <= 40:
                reasons.append("Unfavourable session")
            if row['drawdown_health'] <= 50:
                reasons.append("Elevated drawdown risk")
            if row['daily_risk_score'] <= 50:
                reasons.append("Negative daily performance")
            if not reasons:
                reasons.append("Neutral conditions")
            return ". ".join(reasons) + "."

        df['guardian_reason'] = df.apply(build_reason, axis=1)

        decision_labels = {0: "BLOCK", 1: "PAPER ONLY", 2: "REDUCE RISK", 3: "PASS"}
        df['decision_label'] = df['guardian_decision'].map(decision_labels)

    # ─────────────────────────────────────────────────────────────────────
    # PERFORMANCE COMPARISON — GUARDIAN PROVES ITS VALUE
    # ─────────────────────────────────────────────────────────────────────
    def compute_performance_by_decision(self):
        """
        Simulate a simple trend-following trade on every bar and compare
        performance across Guardian decision states. If Guardian is working,
        PASS trades must show materially better robustness.
        """
        logger.info("Simulating trades and comparing performance by Guardian decision...")
        df = self.df

        # Simple signal: long if close > vwap, short if close < vwap
        df['signal'] = np.where(df['close'] > df['vwap'], 1, -1)

        # Exit: ATR-based TP and SL on next bar
        df['stop_dist'] = df['slow_atr'] * ATR_STOP_MULT
        df['tp_dist']   = df['slow_atr'] * ATR_TP_MULT

        df['next_high'] = df['high'].shift(-1)
        df['next_low']  = df['low'].shift(-1)

        # Long trade outcome
        df['long_tp_hit'] = df['next_high'] >= (df['close'] + df['tp_dist'])
        df['long_sl_hit'] = df['next_low']  <= (df['close'] - df['stop_dist'])
        df['long_pnl'] = np.where(
            df['long_tp_hit'],  df['tp_dist']   * POINT_VALUE,
            np.where(df['long_sl_hit'], -df['stop_dist'] * POINT_VALUE, 0)
        )

        # Short trade outcome
        df['short_tp_hit'] = df['next_low']  <= (df['close'] - df['tp_dist'])
        df['short_sl_hit'] = df['next_high'] >= (df['close'] + df['stop_dist'])
        df['short_pnl'] = np.where(
            df['short_tp_hit'],  df['tp_dist']   * POINT_VALUE,
            np.where(df['short_sl_hit'], -df['stop_dist'] * POINT_VALUE, 0)
        )

        df['trade_pnl'] = np.where(df['signal'] == 1, df['long_pnl'], df['short_pnl'])
        df['is_winner'] = df['trade_pnl'] > 0
        df['is_loser']  = df['trade_pnl'] < 0

        results = []
        for decision_val, label in [(3, "PASS"), (2, "REDUCE RISK"), (1, "PAPER ONLY"), (0, "BLOCK")]:
            subset = df[(df['guardian_decision'] == decision_val) & df['is_rth'] & (df['trade_pnl'] != 0)].copy()
            if len(subset) < 10:
                continue

            wins   = subset[subset['is_winner']]['trade_pnl']
            losses = subset[subset['is_loser']]['trade_pnl']

            gross_profit = wins.sum()
            gross_loss   = abs(losses.sum())
            net_profit   = gross_profit - gross_loss
            profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
            win_rate     = len(wins) / len(subset) * 100
            avg_winner   = wins.mean() if len(wins) > 0 else 0
            avg_loser    = losses.mean() if len(losses) > 0 else 0
            expectancy   = (win_rate/100 * avg_winner) + ((1 - win_rate/100) * avg_loser)

            # Max drawdown
            cumulative = subset['trade_pnl'].cumsum()
            rolling_max = cumulative.cummax()
            drawdown = cumulative - rolling_max
            max_dd = drawdown.min()

            # Largest losing streak
            streak = 0
            max_streak = 0
            for pnl in subset['trade_pnl']:
                if pnl < 0:
                    streak += 1
                    max_streak = max(max_streak, streak)
                else:
                    streak = 0

            results.append({
                'Decision':          label,
                'Trade Count':       len(subset),
                'Win Rate (%)':      round(win_rate, 1),
                'Net Profit ($)':    round(net_profit, 0),
                'Profit Factor':     round(profit_factor, 3),
                'Expectancy ($)':    round(expectancy, 2),
                'Max Drawdown ($)':  round(max_dd, 0),
                'Avg Winner ($)':    round(avg_winner, 2),
                'Avg Loser ($)':     round(avg_loser, 2),
                'Largest Loss Streak': max_streak,
            })

        self.performance_results = pd.DataFrame(results)
        return self.performance_results

    # ─────────────────────────────────────────────────────────────────────
    # REPORT
    # ─────────────────────────────────────────────────────────────────────
    def print_report(self):
        logger.info("\n" + "="*70)
        logger.info("GUARDIAN RISK INTELLIGENCE ENGINE v0.2 — FULL REPORT")
        logger.info("="*70)

        df = self.df
        rth = df[df['is_rth']]

        logger.info(f"\nTotal RTH Bars: {len(rth):,}")
        logger.info("\nGuardian Decision Distribution:")
        for label, count in rth['decision_label'].value_counts().items():
            pct = count / len(rth) * 100
            logger.info(f"  {label:<15}: {count:>6,} bars ({pct:.1f}%)")

        logger.info("\nAverage Component Scores by Decision State:")
        score_cols = ['regime_score','confidence_score','volatility_score',
                      'session_score','drawdown_health','daily_risk_score','overall_risk_score']
        avg_scores = rth.groupby('decision_label')[score_cols].mean().round(1)
        logger.info(f"\n{avg_scores.to_string()}")

        logger.info("\n" + "="*70)
        logger.info("PERFORMANCE COMPARISON BY GUARDIAN DECISION STATE")
        logger.info("="*70)
        logger.info(f"\n{self.performance_results.to_string(index=False)}")

        # Hypothesis evaluation
        logger.info("\n" + "="*70)
        logger.info("HYPOTHESIS: PASS trades outperform BLOCK trades")
        logger.info("="*70)
        pass_row  = self.performance_results[self.performance_results['Decision'] == 'PASS']
        block_row = self.performance_results[self.performance_results['Decision'] == 'BLOCK']
        if len(pass_row) > 0 and len(block_row) > 0:
            pf_pass  = pass_row['Profit Factor'].values[0]
            pf_block = block_row['Profit Factor'].values[0]
            dd_pass  = pass_row['Max Drawdown ($)'].values[0]
            dd_block = block_row['Max Drawdown ($)'].values[0]
            result = "ACCEPTED" if pf_pass > pf_block else "REJECTED"
            logger.info(f"  PASS  Profit Factor: {pf_pass}")
            logger.info(f"  BLOCK Profit Factor: {pf_block}")
            logger.info(f"  PASS  Max Drawdown:  ${dd_pass:,.0f}")
            logger.info(f"  BLOCK Max Drawdown:  ${dd_block:,.0f}")
            logger.info(f"\n  Hypothesis Result: {result}")
            if result == "ACCEPTED":
                logger.info("  Evidence: Guardian PASS state demonstrates materially superior robustness.")
            else:
                logger.info("  Evidence: Guardian does not improve performance. Hypothesis rejected.")

        # Save
        out_dir = Path("/home/ubuntu/Project-Atlas/research-engine/results")
        out_dir.mkdir(exist_ok=True)
        self.performance_results.to_csv(out_dir / "guardian_v2_performance_by_decision.csv", index=False)
        logger.info(f"\nResults saved to {out_dir / 'guardian_v2_performance_by_decision.csv'}")


if __name__ == "__main__":
    data_file = "/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv"
    if not Path(data_file).exists():
        logger.error(f"Data file not found: {data_file}")
    else:
        engine = GuardianRiskIntelligenceEngine(data_file)
        engine.load_data()
        engine.compute_regime_inputs()
        engine.compute_component_scores()
        engine.compute_guardian_decision()
        engine.compute_performance_by_decision()
        engine.print_report()
