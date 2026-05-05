from strategies.base_strategy import BaseStrategy
from alpaca.data.timeframe import TimeFrame
from datetime import datetime, timedelta
import ta

class RSIMeanReversion(BaseStrategy):
    def __init__(self, symbols, rsi_window=14, overbought=70, oversold=30):
        super().__init__("RSI_Mean_Reversion", symbols)
        self.rsi_window = rsi_window
        self.overbought = overbought
        self.oversold = oversold

    def run(self):
        end = datetime.utcnow()
        start = end - timedelta(days=30)
        
        for symbol in self.symbols:
            df = self.get_data(symbol, TimeFrame.Hour, start, end)
            if df.empty or len(df) < self.rsi_window:
                continue
                
            df['rsi'] = ta.momentum.rsi(df['close'], window=self.rsi_window)
            
            last_row = df.iloc[-1]
            prev_row = df.iloc[-2]
            
            # Crosses below oversold -> BUY (mean reversion expects it to bounce back up)
            if prev_row['rsi'] >= self.oversold and last_row['rsi'] < self.oversold:
                print(f"[{self.name}] BUY signal for {symbol} (RSI: {last_row['rsi']:.2f})")
                self.execute_trade(symbol, "buy", 1.0)
                
            # Crosses above overbought -> SELL
            elif prev_row['rsi'] <= self.overbought and last_row['rsi'] > self.overbought:
                print(f"[{self.name}] SELL signal for {symbol} (RSI: {last_row['rsi']:.2f})")
                self.execute_trade(symbol, "sell", 1.0)
