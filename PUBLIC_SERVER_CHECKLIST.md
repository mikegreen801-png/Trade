# Public Server Checklist

Use this checklist when deploying Day Trader OS to Vercel as a public site.

## Deploy The Whole Project

The project root must include:

- `index.html`
- `vercel.toml`
- `vercel/functions/analyze.js`
- `vercel/functions/health.js`
- `vercel/functions/site-status.js`
- all tool `.html` pages
- `assets/`

Do not deploy a single HTML file if you want live data.

## Vercel Environment Variables

Add these in Vercel Site configuration -> Environment variables:

```text
ALPACA_API_KEY_ID=your_paper_key_id
ALPACA_API_SECRET_KEY=your_paper_secret_key
ALPACA_TRADING_BASE_URL=https://paper-api.alpaca.markets
ALPACA_DATA_BASE_URL=https://data.alpaca.markets
ALPACA_STOCK_FEED=iex
ALPACA_CRYPTO_LOC=us
ENABLE_ALPACA_ORDER_SUBMIT=false
```

Redeploy after saving the variables.

Use these Alpaca endpoints:

- Paper trading account/orders: `https://paper-api.alpaca.markets`
- Live trading account/orders: `https://api.alpaca.markets`
- Market data: `https://data.alpaca.markets`

Start with paper trading. Only switch `ALPACA_TRADING_BASE_URL` to `https://api.alpaca.markets` after live order auth, previews, buying-power checks, request-id logging, and final manual confirmation are ready.

## Public URLs To Test

Replace `your-site-name` with your Vercel site name:

- `https://your-site-name.vercel.app/api/health`
- `https://your-site-name.vercel.app/api/site-status`
- `https://your-site-name.vercel.app/api/analyze?symbol=AAPL`
- `https://your-site-name.vercel.app/signal_dashboard`
- `https://your-site-name.vercel.app/broker_execution_plan`

If `/api/health` fails, functions are not deployed. If `/api/analyze` works but does not show Alpaca as the candle source, check keys, feed entitlement, and redeploy status.

## Connection Rules

- Public visitors can use market data through `/api/analyze`.
- Alpaca secrets stay on Vercel, not in browser JavaScript.
- Signup/login profiles are local demo profiles until a real auth/database layer is added.
- Live order submit stays locked until broker auth, order preview, buying-power checks, request-id logging, and final manual confirmation are built.

