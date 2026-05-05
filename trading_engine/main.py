import asyncio
from fastapi import FastAPI, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from core.database import init_db, get_db, TradeRecord
from strategies.sma_crossover import SMACrossover
from strategies.rsi_mean_reversion import RSIMeanReversion
from strategies.momentum import MomentumTracker

app = FastAPI(title="Trading Engine API")

# Allow requests from the Node.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this
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
    return {
        "is_running": bot_state["is_running"],
        "active_symbols": bot_state["active_symbols"],
        "strategies": [s.name for s in bot_state["strategies"]]
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

@app.get("/api/bot/trades")
def get_trades(db: Session = Depends(get_db), limit: int = 50):
    trades = db.query(TradeRecord).order_by(TradeRecord.timestamp.desc()).limit(limit).all()
    return trades
