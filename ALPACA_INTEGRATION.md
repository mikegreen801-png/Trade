# Alpaca Integration Setup Guide

## Overview
Your Trade application now has full integration with Alpaca Markets for real trading execution. The system is built with **safety-first** architecture.

## ✅ What's New

### Backend APIs Created
- **`/api/account`** - Get account info, positions, order history
- **`/api/trading`** - Submit orders, cancel orders
- **`/api/market`** - Real-time bars, history, calendar, clock data

### Core Components
- **`api/alpaca-client.js`** - Centralized Alpaca API wrapper
- **`alpaca-integration.js`** - Frontend library for easy API calls
- Pre-built safety checks (market hours, PDT rules, balance verification)

## 🔐 Safety Features

The system includes multiple safeguards:

1. **Order Submission Disabled by Default**
   - Set `ENABLE_ALPACA_ORDER_SUBMIT=true` only when ready
   - Prevents accidental real trades during development

2. **Market Hours Validation**
   - Orders rejected outside market hours
   - Queued for next open automatically

3. **Pattern Day Trader (PDT) Compliance**
   - Enforces $25,000 minimum for day trading
   - Validates buying power automatically

4. **Paper Trading by Default**
   - Uses `https://paper-api.alpaca.markets` endpoint
   - Perfect for testing without risk

## 📋 Setup Instructions

### 1. Get Alpaca API Credentials

Go to [Alpaca Dashboard](https://app.alpaca.markets):
1. Sign up or log in
2. Create a **Paper Trading** account
3. Go to `Dashboard > API Keys`
4. Copy your **API Key ID** and **Secret Key**

### 2. Configure Environment Variables

Create `.env` file in your project root:

```dotenv
# Paper Trading (SAFE - No real money)
ALPACA_API_KEY_ID=your_paper_key_id
ALPACA_API_SECRET_KEY=your_paper_secret_key
ALPACA_TRADING_BASE_URL=https://paper-api.alpaca.markets
ALPACA_DATA_BASE_URL=https://data.alpaca.markets

# Keep disabled until ready for live trading
ENABLE_ALPACA_ORDER_SUBMIT=false

# Port
PORT=3000
```

### 3. Run Your Server

```bash
npm install
npm start
```

## 🚀 Using the APIs from Frontend

### Get Account Information

```javascript
// In your HTML file after loading alpaca-integration.js
const account = await alpacaAPI.getAccount();
console.log('Buying Power:', account.account.buyingPower);
console.log('Portfolio Value:', account.account.portfolioValue);
```

### Get Real-Time Price

```javascript
const bars = await alpacaAPI.getLatestBars('AAPL,MSFT,TSLA');
console.log('AAPL Price:', bars.data.AAPL.price);
```

### Get Historical Bars

```javascript
const history = await alpacaAPI.getBarHistory('AAPL', '1Hour', 50);
// Returns: timestamp, open, high, low, close, volume, vwap
```

### Submit a Paper Trade

```javascript
try {
  const order = await alpacaAPI.submitOrder('AAPL', 100, 'buy', 'market');
  console.log('Order placed:', order.order.id);
} catch (error) {
  console.error('Order rejected:', error.message);
}
```

### Get Positions

```javascript
const positions = await alpacaAPI.getPositions();
positions.positions.forEach(pos => {
  console.log(`${pos.symbol}: ${pos.qty} shares @ $${pos.currentPrice}`);
});
```

### Check if Market is Open

```javascript
const isOpen = await alpacaAPI.isMarketOpen();
if (isOpen) {
  console.log('Market is OPEN - ready to trade');
} else {
  console.log('Market is CLOSED');
}
```

## 🔄 Transition to Live Trading

When you're ready for **real money**:

### Step 1: Switch to Live Account
Change in `.env`:
```dotenv
ALPACA_API_KEY_ID=your_live_key_id
ALPACA_API_SECRET_KEY=your_live_secret_key
ALPACA_TRADING_BASE_URL=https://api.alpaca.markets  # ← LIVE endpoint
```

### Step 2: Enable Order Submission
```dotenv
ENABLE_ALPACA_ORDER_SUBMIT=true  # ⚠️ CAREFUL!
```

### Step 3: Add Extra Precautions

Add this to your frontend before trading:
```javascript
// Require user confirmation
if (confirm('⚠️ LIVE TRADING ENABLED\n\n$' + amount + ' will be traded with REAL MONEY.\n\nContinue?')) {
  alpacaAPI.setLiveMode(true);
  await alpacaAPI.submitOrder(...);
}
```

## 📊 Example: Complete Trade Flow

```javascript
// 1. Check market
const clock = await alpacaAPI.getMarketClock();
if (!clock.isOpen) {
  alert('Market is closed');
  return;
}

// 2. Check account
const account = await alpacaAPI.getAccount();
if (account.account.portfolioValue < 25000) {
  alert('Insufficient funds for day trading');
  return;
}

// 3. Get real-time price
const bars = await alpacaAPI.getLatestBars('AAPL');
const currentPrice = bars.data.AAPL.price;

// 4. Calculate position size
const riskAmount = 100; // Risk $100 per trade
const qty = Math.floor(riskAmount / currentPrice);

// 5. Place order
const order = await alpacaAPI.submitOrder('AAPL', qty, 'buy', 'market');
console.log('Trade executed:', order);
```

## 🛠️ API Reference

### Account Endpoints

**Get Account Info**
```
GET /api/account?action=info
Returns: buyingPower, portfolioValue, cash, dayTradesRemaining, status
```

**Get Positions**
```
GET /api/account?action=positions
Returns: array of {symbol, qty, avgFillPrice, currentPrice, unrealizedGain}
```

**Get Orders**
```
GET /api/account?action=orders&status=all
Returns: array of {id, symbol, qty, side, type, status, filledQty}
```

### Trading Endpoints

**Submit Order**
```
POST /api/trading?action=submit
Body: {symbol, qty, side, orderType, limitPrice, stopPrice}
Returns: {id, symbol, qty, side, status}
```

**Cancel Order**
```
DELETE /api/trading?action=cancel&orderId=abc123
Returns: {message: 'Order cancelled'}
```

### Market Data Endpoints

**Latest Bars**
```
GET /api/market?action=latest&symbols=AAPL,MSFT
Returns: {AAPL: {price, open, high, low, volume}, ...}
```

**Bar History**
```
GET /api/market?action=history&symbol=AAPL&timeframe=1Day&limit=100
Returns: array of {timestamp, open, high, low, close, volume, vwap}
```

## ⚠️ Important Warnings

1. **Never commit `.env` with real API keys** - Use `.env.local` or `.gitignore`
2. **Start with paper trading** - Test all strategies first
3. **Small position sizes** - Risk management is critical
4. **Monitor manually** - Don't leave running unattended
5. **PDT Rule** - Need $25,000 minimum for day trading

## 🔗 Resources

- [Alpaca API Docs](https://docs.alpaca.markets/)
- [Market Data Docs](https://docs.alpaca.markets/api-references/market-data-api/)
- [Trading API Docs](https://docs.alpaca.markets/api-references/trading-api/)
- [Order Types Guide](https://docs.alpaca.markets/user-guide/orders)

---

**Ready to trade? Start with paper trading and test thoroughly before going live! 🚀**
