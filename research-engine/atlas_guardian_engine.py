import pandas as pd
import numpy as np
import logging
import warnings
from pathlib import Path
from datetime import datetime

# Suppress pandas warnings
warnings.filterwarnings('ignore')

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/tmp/guardian_output.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class AtlasGuardianEngine:
    """
    Sprint 020: Guardian Decision Engine
    
    Guardian's responsibility is to maximise survival. It consumes the outputs
    of the Market Regime Engine and other modules to output one of four decisions:
    PASS, REDUCE RISK, PAPER ONLY, BLOCK.
    """
    
    def __init__(self, data_path: str):
        self.data_path = Path(data_path)
        self.df = None
        
    def load_data(self):
        """Load and prepare the 2-year MNQ dataset."""
        logger.info(f"Loading data from {self.data_path}...")
        self.df = pd.read_csv(self.data_path)
        
        # Parse timestamps
        if 'timestamp_et' in self.df.columns:
            self.df['time'] = pd.to_datetime(self.df['timestamp_et'], utc=True)
        elif 'time' in self.df.columns:
            self.df['time'] = pd.to_datetime(self.df['time'], utc=True)
        else:
            self.df['time'] = pd.to_datetime(self.df.iloc[:, 0], utc=True)
            
        self.df = self.df.sort_values('time').reset_index(drop=True)
        logger.info(f"Loaded {len(self.df):,} rows from {self.df['time'].min()} to {self.df['time'].max()}")
        
    def compute_regime_inputs(self):
        """Compute the frozen v1.0 Regime Engine outputs to feed into Guardian."""
        logger.info("Computing frozen Regime Engine v1.0 inputs...")
        
        # H2/H6: ATR Expansion/Compression
        self.df['tr'] = np.maximum(
            self.df['high'] - self.df['low'],
            np.maximum(
                abs(self.df['high'] - self.df['close'].shift(1)),
                abs(self.df['low'] - self.df['close'].shift(1))
            )
        )
        self.df['fast_atr'] = self.df['tr'].rolling(5).mean()
        self.df['slow_atr'] = self.df['tr'].rolling(20).mean()
        self.df['atr_ratio'] = np.where(self.df['slow_atr'] > 0, self.df['fast_atr'] / self.df['slow_atr'], 1.0)
        
        # H7: VWAP Deviation
        self.df['date'] = self.df['time'].dt.date
        self.df['hlc3'] = (self.df['high'] + self.df['low'] + self.df['close']) / 3
        self.df['vol_price'] = self.df['hlc3'] * self.df['volume']
        
        self.df['cum_vol_price'] = self.df.groupby('date')['vol_price'].cumsum()
        self.df['cum_vol'] = self.df.groupby('date')['volume'].cumsum()
        self.df['vwap'] = np.where(self.df['cum_vol'] > 0, self.df['cum_vol_price'] / self.df['cum_vol'], self.df['close'])
        
        self.df['atr_14'] = self.df['tr'].rolling(14).mean()
        self.df['vwap_dev'] = np.where(self.df['atr_14'] > 0, abs(self.df['close'] - self.df['vwap']) / self.df['atr_14'], 0)
        
        # Tradeability Score (Frozen v1.0 logic)
        self.df['is_compressed'] = self.df['atr_ratio'] <= 0.7
        self.df['is_expanded'] = self.df['atr_ratio'] >= 1.1
        self.df['is_good_loc'] = self.df['vwap_dev'] <= 1.5
        
        self.df['tradeability_score'] = 0
        self.df.loc[self.df['is_compressed'], 'tradeability_score'] += 50
        self.df.loc[~self.df['is_compressed'] & self.df['is_expanded'], 'tradeability_score'] += 25
        self.df.loc[self.df['is_good_loc'], 'tradeability_score'] += 25
        
    def compute_guardian_state(self):
        """Compute the Guardian Decision Engine outputs."""
        logger.info("Computing Guardian Decision Engine states...")
        
        # Session Context
        self.df['hour'] = self.df['time'].dt.hour
        self.df['minute'] = self.df['time'].dt.minute
        self.df['time_decimal'] = self.df['hour'] + self.df['minute'] / 60.0
        
        # Define Sessions
        # RTH: 9:30 to 16:00 ET
        self.df['is_rth'] = (self.df['time_decimal'] >= 9.5) & (self.df['time_decimal'] < 16.0)
        # Opening Auction: 9:30 to 10:00 ET (High noise)
        self.df['is_opening_auction'] = (self.df['time_decimal'] >= 9.5) & (self.df['time_decimal'] < 10.0)
        # Lunch chop: 12:00 to 13:30 ET
        self.df['is_lunch'] = (self.df['time_decimal'] >= 12.0) & (self.df['time_decimal'] < 13.5)
        
        # Simulated Drawdown/Loss State (using a proxy of recent extreme negative moves)
        # In a real execution environment, this reads actual account equity.
        # Here we simulate "High Risk State" if the last 5 bars had extreme downside volatility.
        self.df['recent_loss_proxy'] = self.df['close'] - self.df['close'].shift(5)
        self.df['is_high_risk_state'] = self.df['recent_loss_proxy'] < -(self.df['slow_atr'] * 3)
        
        # Guardian Decision Logic
        # Outputs: 3=PASS, 2=REDUCE RISK, 1=PAPER ONLY, 0=BLOCK
        
        self.df['guardian_decision'] = 3 # Default to PASS
        self.df['guardian_reason'] = "Clear"
        
        # Rule 1: BLOCK if outside RTH
        mask_block_time = ~self.df['is_rth']
        self.df.loc[mask_block_time, 'guardian_decision'] = 0
        self.df.loc[mask_block_time, 'guardian_reason'] = "Outside RTH"
        
        # Rule 2: BLOCK if Tradeability Score is 0 (Absolute chop/poor location)
        mask_block_regime = self.df['is_rth'] & (self.df['tradeability_score'] == 0)
        self.df.loc[mask_block_regime, 'guardian_decision'] = 0
        self.df.loc[mask_block_regime, 'guardian_reason'] = "Zero Tradeability"
        
        # Rule 3: PAPER ONLY if High Risk State (Drawdown proxy)
        mask_paper_risk = self.df['is_rth'] & (self.df['tradeability_score'] > 0) & self.df['is_high_risk_state']
        self.df.loc[mask_paper_risk, 'guardian_decision'] = 1
        self.df.loc[mask_paper_risk, 'guardian_reason'] = "High Risk State"
        
        # Rule 4: REDUCE RISK if Opening Auction or Lunch Chop
        mask_reduce_session = self.df['is_rth'] & (self.df['tradeability_score'] > 0) & ~self.df['is_high_risk_state'] & (self.df['is_opening_auction'] | self.df['is_lunch'])
        self.df.loc[mask_reduce_session, 'guardian_decision'] = 2
        self.df.loc[mask_reduce_session, 'guardian_reason'] = "Session Context"
        
        # Rule 5: REDUCE RISK if Tradeability is only 25
        mask_reduce_regime = self.df['is_rth'] & (self.df['tradeability_score'] == 25) & ~self.df['is_high_risk_state'] & ~self.df['is_opening_auction'] & ~self.df['is_lunch']
        self.df.loc[mask_reduce_regime, 'guardian_decision'] = 2
        self.df.loc[mask_reduce_regime, 'guardian_reason'] = "Low Tradeability"
        
    def analyze_guardian_impact(self):
        """Analyze how Guardian decisions impact the raw tradeable universe."""
        logger.info("Analyzing Guardian impact...")
        
        total_bars = len(self.df)
        rth_bars = self.df['is_rth'].sum()
        
        decision_counts = self.df[self.df['is_rth']]['guardian_decision'].value_counts().sort_index()
        reason_counts = self.df[self.df['is_rth']]['guardian_reason'].value_counts()
        
        logger.info(f"Total RTH Bars: {rth_bars:,}")
        logger.info("\nGuardian Decisions (RTH Only):")
        logger.info(f"PASS (3):        {decision_counts.get(3, 0):,} ({(decision_counts.get(3, 0)/rth_bars)*100:.1f}%)")
        logger.info(f"REDUCE RISK (2): {decision_counts.get(2, 0):,} ({(decision_counts.get(2, 0)/rth_bars)*100:.1f}%)")
        logger.info(f"PAPER ONLY (1):  {decision_counts.get(1, 0):,} ({(decision_counts.get(1, 0)/rth_bars)*100:.1f}%)")
        logger.info(f"BLOCK (0):       {decision_counts.get(0, 0):,} ({(decision_counts.get(0, 0)/rth_bars)*100:.1f}%)")
        
        logger.info("\nBlock/Reduce Reasons:")
        for reason, count in reason_counts.items():
            if reason != "Clear":
                logger.info(f"- {reason}: {count:,}")
                
        # Save results
        output_dir = Path("/home/ubuntu/Project-Atlas/research-engine/results")
        output_dir.mkdir(exist_ok=True)
        
        summary = pd.DataFrame({
            'Decision': ['BLOCK', 'PAPER ONLY', 'REDUCE RISK', 'PASS'],
            'Count': [decision_counts.get(0, 0), decision_counts.get(1, 0), decision_counts.get(2, 0), decision_counts.get(3, 0)],
            'Percentage': [
                (decision_counts.get(0, 0)/rth_bars)*100,
                (decision_counts.get(1, 0)/rth_bars)*100,
                (decision_counts.get(2, 0)/rth_bars)*100,
                (decision_counts.get(3, 0)/rth_bars)*100
            ]
        })
        summary.to_csv(output_dir / "guardian_decision_summary.csv", index=False)
        logger.info(f"Saved Guardian summary to {output_dir / 'guardian_decision_summary.csv'}")

if __name__ == "__main__":
    data_file = "/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv"
    if not Path(data_file).exists():
        logger.error(f"Data file not found: {data_file}")
    else:
        engine = AtlasGuardianEngine(data_file)
        engine.load_data()
        engine.compute_regime_inputs()
        engine.compute_guardian_state()
        engine.analyze_guardian_impact()
