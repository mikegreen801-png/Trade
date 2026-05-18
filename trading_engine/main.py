import asyncio
import os
from fastapi import FastAPI, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from core.database import init_db, get_db, TradeRecord
from strategies.sma_crossover import SMACrossover
from strategies.rsi_mean_reversion import RSIMeanReversion
from strategies.momentum import MomentumTracker

app = FastAPI(title="Trading Engine API")

_NODE_ORIGIN = os.getenv("NODE_ORIGIN", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[_NODE_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global bot state
bot_state = {
    "is_running": False,
    "active_symbols": ["AAPL", "MSFT", "SPY"],
    "strategies": []
}

def get_alpaca_info():
    """Safely read Alpaca connection status without crashing if keys are missing."""
    try:
        from core.alpaca_broker import AlpacaBroker, IS_LIVE, API_KEY
        account = AlpacaBroker.get_account()
        return {
            "connected": True,
            "mode": "live" if IS_LIVE else "paper",
            "account_id": account.id if hasattr(account, 'id') else str(account.get('id', ''))[:8],
            "buying_power": float(account.buying_power) if hasattr(account, 'buying_power') else float(account.get('buying_power', 0)),
            "portfolio_value": float(account.portfolio_value) if hasattr(account, 'portfolio_value') else float(account.get('portfolio_value', 0)),
            "cash": float(account.cash) if hasattr(account, 'cash') else float(account.get('cash', 0)),
            "equity": float(account.equity) if hasattr(account, 'equity') else float(account.get('equity', 0)),
            "day_trade_count": int(account.daytrade_count) if hasattr(account, 'daytrade_count') else int(account.get('daytrade_count', 0)),
            "pattern_day_trader": bool(account.pattern_day_trader) if hasattr(account, 'pattern_day_trader') else bool(account.get('pattern_day_trader', False)),
            "api_key_preview": API_KEY[:4] + "..." + API_KEY[-4:] if API_KEY and len(API_KEY) > 8 else "set",
        }
    except Exception as e:
        return {
            "connected": False,
            "mode": "paper",
            "error": str(e),
            "buying_power": 0,
            "portfolio_value": 0,
            "cash": 0,
            "equity": 0,
            "day_trade_count": 0,
            "pattern_day_trader": False,
            "api_key_preview": "not set",
        }

@app.on_event("startup")
def on_startup():
    init_db()
    # Initialize strategies
    bot_state["strategies"] = [
        SMACrossover(bot_state["active_symbols"]),
        RSIMeanReversion(bot_state["active_symbols"]),
        MomentumTracker(bot_state["active_symbols"])
    ]

async def trading_loop():
    while bot_state["is_running"]:
        print("Running strategy evaluation cycle...")
        for strategy in bot_state["strategies"]:
            try:
                strategy.run()
            except Exception as e:
                print(f"Error running strategy {strategy.name}: {e}")
        # Wait before next evaluation (e.g. 5 minutes)
        await asyncio.sleep(300)

@app.get("/api/bot/status")
def get_status():
    alpaca = get_alpaca_info()
    return {
        "is_running": bot_state["is_running"],
        "active_symbols": bot_state["active_symbols"],
        "strategies": [s.name for s in bot_state["strategies"]],
        "alpaca": alpaca,
    }

@app.post("/api/bot/start")
def start_bot(background_tasks: BackgroundTasks):
    if not bot_state["is_running"]:
        bot_state["is_running"] = True
        background_tasks.add_task(trading_loop)
    return {"message": "Bot started", "is_running": True}

@app.post("/api/bot/stop")
def stop_bot():
    bot_state["is_running"] = False
    return {"message": "Bot stopped", "is_running": False}

@app.get("/api/bot/connection")
def get_connection():
    """Return Alpaca connection details for the dashboard Connection Console."""
    return get_alpaca_info()

@app.post("/api/bot/connection")
def update_connection(payload: dict):
    """Toggle paper/live mode by setting env var and reinitializing."""
    mode = payload.get("mode", "paper").lower()
    if mode not in ("paper", "live"):
        return {"error": "mode must be 'paper' or 'live'"}, 400
    os.environ["ALPACA_IS_LIVE"] = "true" if mode == "live" else "false"
    # Force reimport of alpaca_broker with new env
    import importlib
    import core.alpaca_broker as broker_mod
    importlib.reload(broker_mod)
    return get_alpaca_info()

@app.get("/api/bot/watchlist")
def get_watchlist():
    return {"symbols": bot_state["active_symbols"]}

@app.post("/api/bot/watchlist")
def update_watchlist(payload: dict):
    symbols = payload.get("symbols", [])
    if not isinstance(symbols, list):
        return {"error": "symbols must be a list"}, 400
    # Clean and cap at 15
    cleaned = list(dict.fromkeys(
        s.strip().upper() for s in symbols if isinstance(s, str) and s.strip()
    ))[:15]
    bot_state["active_symbols"] = cleaned
    # Reinitialize strategies with updated symbols
    bot_state["strategies"] = [
        SMACrossover(cleaned),
        RSIMeanReversion(cleaned),
        MomentumTracker(cleaned)
    ]
    return {"symbols": cleaned, "message": f"Watchlist updated to {len(cleaned)} symbols"}

@app.get("/api/bot/trades")
def get_trades(db: Session = Depends(get_db), limit: int = 50):
    trades = db.query(TradeRecord).order_by(TradeRecord.timestamp.desc()).limit(limit).all()
    return trades

@app.post("/api/bot/simulate")
def run_simulation(payload: dict):
    from simulator import MonteCarloSimulator
    try:
        sim = MonteCarloSimulator(
            initial_capital=float(payload.get("initial_capital", 100000)),
            iterations=int(payload.get("iterations", 1000)),
            periods=int(payload.get("periods", 252))
        )
        result = sim.simulate(
            win_rate=float(payload.get("win_rate", 0.5)),
            avg_win_pct=float(payload.get("avg_win_pct", 0.02)),
            avg_loss_pct=float(payload.get("avg_loss_pct", 0.01)),
            slippage_pct=float(payload.get("slippage_pct", 0.001)),
            black_swan_prob=float(payload.get("black_swan_prob", 0.005)),
            black_swan_drop_pct=float(payload.get("black_swan_drop_pct", 0.20))
        )
        return result
    except Exception as e:
        return {"error": str(e)}, 400

@app.get("/api/bot/swarm")
async def run_swarm_analysis(symbol: str = "SPY"):
    from swarm import SwarmOrchestrator
    try:
        orchestrator = SwarmOrchestrator(symbol.upper())
        result = await orchestrator.run_swarm()
        return result
    except Exception as e:
        return {"error": str(e)}, 500
