from strategies.base_strategy import BaseStrategy
from alpaca.data.timeframe import TimeFrame
from datetime import datetime, timedelta
import ta

class SMACrossover(BaseStrategy):
    def __init__(self, symbols, fast_window=10, slow_window=30):
        super().__init__("SMA_Crossover", symbols)
        self.fast_window = fast_window
        self.slow_window = slow_window

    def run(self):
        end = datetime.utcnow()
        start = end - timedelta(days=60) # Fetch enough data for slow MA
        
        for symbol in self.symbols:
            df = self.get_data(symbol, TimeFrame.Day, start, end)
            if df.empty or len(df) < self.slow_window:
                continue
                
            df['fast_sma'] = ta.trend.sma_indicator(df['close'], window=self.fast_window)
            df['slow_sma'] = ta.trend.sma_indicator(df['close'], window=self.slow_window)
            
            # Get last two rows to check for crossover
            last_row = df.iloc[-1]
            prev_row = df.iloc[-2]
            
            # Fast crosses over Slow -> BUY
            if prev_row['fast_sma'] <= prev_row['slow_sma'] and last_row['fast_sma'] > last_row['slow_sma']:
                print(f"[{self.name}] BUY signal for {symbol}")
                self.execute_trade(symbol, "buy", 1.0)
                
            # Fast crosses under Slow -> SELL
            elif prev_row['fast_sma'] >= prev_row['slow_sma'] and last_row['fast_sma'] < last_row['slow_sma']:
                print(f"[{self.name}] SELL signal for {symbol}")
                self.execute_trade(symbol, "sell", 1.0)
