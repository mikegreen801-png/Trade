from strategies.base_strategy import BaseStrategy
from alpaca.data.timeframe import TimeFrame
from datetime import datetime, timedelta
import pandas as pd

class MomentumTracker(BaseStrategy):
    def __init__(self, symbols, lookback_periods=5):
        super().__init__("Momentum_Tracker", symbols)
        self.lookback_periods = lookback_periods

    def run(self):
        end = datetime.utcnow()
        start = end - timedelta(days=10) # Enough data for lookback
        
        for symbol in self.symbols:
            df = self.get_data(symbol, TimeFrame.Day, start, end)
            if df.empty or len(df) <= self.lookback_periods:
                continue
                
            # Calculate simple momentum (Rate of Change)
            current_close = df['close'].iloc[-1]
            past_close = df['close'].iloc[-(self.lookback_periods + 1)]
            
            momentum_pct = ((current_close - past_close) / past_close) * 100
            
            if momentum_pct > 5.0: # Strong positive momentum
                print(f"[{self.name}] BUY signal for {symbol} (Momentum: +{momentum_pct:.2f}%)")
                self.execute_trade(symbol, "buy", 1.0)
                
            elif momentum_pct < -5.0: # Strong negative momentum
                print(f"[{self.name}] SELL signal for {symbol} (Momentum: {momentum_pct:.2f}%)")
                self.execute_trade(symbol, "sell", 1.0)
