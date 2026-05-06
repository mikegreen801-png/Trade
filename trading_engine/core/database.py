import os
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

# SQLite database in the trading_engine folder
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'trades.db')
engine = create_engine(f'sqlite:///{DB_PATH}', connect_args={'check_same_thread': False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class TradeRecord(Base):
    __tablename__ = 'trades'
    
    id = Column(Integer, primary_key=True, index=True)
    strategy_name = Column(String, index=True)
    symbol = Column(String, index=True)
    side = Column(String) # 'buy' or 'sell'
    qty = Column(Float)
    price = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(String) # 'filled', 'pending', 'failed'

class Watchlist(Base):
    __tablename__ = "watchlist"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, unique=True, index=True)
    is_active = Column(Boolean, default=True)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
