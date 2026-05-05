from abc import ABC, abstractmethod
from core.alpaca_broker import AlpacaBroker
from core.database import SessionLocal, TradeRecord
from datetime import datetime
import pandas as pd

class BaseStrategy(ABC):
    def __init__(self, name: str, symbols: list):
        self.name = name
        self.symbols = symbols
        self.db = SessionLocal()

    @abstractmethod
    def run(self):
        """Execute the strategy logic for the current interval"""
        pass

    def record_trade(self, symbol: str, side: str, qty: float, price: float, status: str):
        trade = TradeRecord(
            strategy_name=self.name,
            symbol=symbol,
            side=side,
            qty=qty,
            price=price,
            timestamp=datetime.utcnow(),
            status=status
        )
        self.db.add(trade)
        self.db.commit()

    def get_data(self, symbol: str, timeframe, start, end) -> pd.DataFrame:
        bars = AlpacaBroker.get_historical_bars(symbol, timeframe, start, end)
        if not bars.data or symbol not in bars.data:
            return pd.DataFrame()
        
        data = []
        for bar in bars.data[symbol]:
            data.append({
                'timestamp': bar.timestamp,
                'open': bar.open,
                'high': bar.high,
                'low': bar.low,
                'close': bar.close,
                'volume': bar.volume,
            })
        df = pd.DataFrame(data)
        df.set_index('timestamp', inplace=True)
        return df

    def execute_trade(self, symbol: str, side: str, qty: float):
        try:
            order = AlpacaBroker.submit_market_order(symbol, qty, side)
            # Roughly estimate price for local DB log since market order is pending
            self.record_trade(symbol, side, qty, 0.0, "submitted")
            return order
        except Exception as e:
            print(f"Error executing trade {side} {qty} {symbol}: {e}")
            self.record_trade(symbol, side, qty, 0.0, "failed")
            return None
