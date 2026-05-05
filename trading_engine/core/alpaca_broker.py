import os
from dotenv import load_dotenv
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest
from alpaca.data.timeframe import TimeFrame

load_dotenv()

# We look for a LIVE flag, default to True for Paper
IS_LIVE = os.getenv("ALPACA_IS_LIVE", "false").lower() == "true"

# Use appropriate keys
if IS_LIVE:
    API_KEY = os.getenv("ALPACA_LIVE_API_KEY_ID")
    SECRET_KEY = os.getenv("ALPACA_LIVE_API_SECRET_KEY")
else:
    API_KEY = os.getenv("ALPACA_API_KEY_ID")
    SECRET_KEY = os.getenv("ALPACA_API_SECRET_KEY")

if not API_KEY or not SECRET_KEY:
    raise ValueError(f"Alpaca API keys are missing. IS_LIVE={IS_LIVE}")

trading_client = TradingClient(API_KEY, SECRET_KEY, paper=not IS_LIVE)
data_client = StockHistoricalDataClient(API_KEY, SECRET_KEY)

class AlpacaBroker:
    @staticmethod
    def get_account():
        return trading_client.get_account()

    @staticmethod
    def submit_market_order(symbol: str, qty: float, side: str):
        order_side = OrderSide.BUY if side.lower() == 'buy' else OrderSide.SELL
        order_data = MarketOrderRequest(
            symbol=symbol,
            qty=qty,
            side=order_side,
            time_in_force=TimeInForce.DAY
        )
        return trading_client.submit_order(order_data=order_data)

    @staticmethod
    def get_historical_bars(symbol: str, timeframe: TimeFrame, start, end):
        req = StockBarsRequest(
            symbol_or_symbols=[symbol],
            timeframe=timeframe,
            start=start,
            end=end
        )
        return data_client.get_stock_bars(req)
