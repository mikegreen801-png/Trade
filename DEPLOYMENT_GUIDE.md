# Day Trader OS Deployment Guide

## What To Use

Use the HTML bundle, not the PDFs, as the source for a website builder or host.

Start from:

- `index.html`
- the other `.html` tool pages
- `assets/daytrader-os.css`
- `assets/daytrader-os.js`
- the included PDF files as downloadable resources

Do not upload only the PDFs to a site maker and expect it to recreate the app. A PDF importer usually turns content into a static marketing page and loses navigation, storage, buttons, and scripts.

## Local Use Outside Codex

1. Unzip `day-trader-os-enhanced.zip`.
2. Open the unzipped folder.
3. Double-click `index.html`.
4. Use the hub page as the home screen.

Every tool has an `OS Hub` button in the lower-right corner that returns to `index.html`.

## Simple 24/7 Hosting

For a basic always-available site, upload the entire extracted folder to a static host.

Good options:

- Vercel drag-and-drop deploy
- Vercel static project
- GitHub Pages
- Cloudflare Pages

Upload the folder contents exactly as-is. The site root must contain `index.html`.

Do not upload just one tool page. Do not upload the PDFs alone.

## Best No-Code Path

Vercel static drag-and-drop is the simplest if you only need the HTML tools. The live public feed needs a real Vercel project deploy so the `vercel/functions` folder is published too.

1. Go to Vercel.
2. Create or log into an account.
3. For live data, create a site from a Git repo or deploy the full folder with Vercel CLI.
4. Make sure the deployed project root contains `index.html`, `vercel.toml`, and the `vercel/functions` folder.
5. Vercel will publish a public URL.

Your public home page should open at:

`https://your-site-name.vercel.app/`

## Public Server Checklist

The app now exposes clean public server routes for hosted users:

- `/api/health`
- `/api/site-status`
- `/api/analyze?symbol=AAPL`
- `/api/alpaca-order-preview`

The older Vercel function paths still work as a fallback, but the site should use `/api/*` in production.

After every Vercel deploy, test these URLs:

- `https://your-site-name.vercel.app/api/health`
- `https://your-site-name.vercel.app/api/site-status`
- `https://your-site-name.vercel.app/api/analyze?symbol=AAPL`
- `https://your-site-name.vercel.app/signal_dashboard`
- `https://your-site-name.vercel.app/broker_execution_plan`

If `/api/health` fails, Vercel did not deploy the functions. Redeploy the full project, not a single HTML file.

## What Works On Static Hosting

These features work as static files:

- Hub navigation
- Risk calculator
- Trade journal
- CSV export
- CSV import
- JSON backup
- JSON restore
- Premarket notes and watchlist
- Backtest simulator
- Pattern library
- TradingView course
- PDF downloads

The home-page stock/crypto search also works on Vercel when the included `vercel/functions/analyze.js` function is deployed with the folder.

## Alpaca Live Data Setup

Alpaca should run only from the backend function. Do not paste Alpaca keys into any `.html` or browser JavaScript file.

1. Create or log into an Alpaca account.
2. Create API keys in Alpaca.
3. In Vercel, open your site dashboard.
4. Go to `Site configuration` -> `Environment variables`.
5. Add:
   - `ALPACA_API_KEY_ID`
   - `ALPACA_API_SECRET_KEY`
   - `ALPACA_TRADING_BASE_URL=https://paper-api.alpaca.markets`
   - Optional: `ALPACA_DATA_BASE_URL=https://data.alpaca.markets`
   - Optional: `ALPACA_STOCK_FEED=iex`
   - Optional paid/SIP plan: `ALPACA_STOCK_FEED=sip`
   - Optional crypto location: `ALPACA_CRYPTO_LOC=us`
   - Keep disabled: `ENABLE_ALPACA_ORDER_SUBMIT=false`
6. Redeploy the site after saving variables.
7. Test:

`https://your-site-name.vercel.app/api/analyze?symbol=AAPL`

The response should include `candles` and a `candleSource` such as `Alpaca stock bars (iex)` when Alpaca is connected. If it returns Yahoo candle proxy instead, Alpaca keys are missing, invalid, or not entitled for that feed.

Alpaca data access depends on your account, data plan, and market-data entitlements. Free/basic stock data usually does not mean every exchange tick; paid SIP data is needed for consolidated U.S. equity market coverage. Crypto coverage depends on supported Alpaca crypto symbols.

Endpoint map:

- Market data: `https://data.alpaca.markets`
- Paper trading account/orders: `https://paper-api.alpaca.markets`
- Live trading account/orders: `https://api.alpaca.markets`

For now, keep `ALPACA_TRADING_BASE_URL=https://paper-api.alpaca.markets`. The app can read public market data through the protected server route while live order submission remains locked.

## Alpaca Trading / Broker Path

Alpaca has three different products that should not be mixed together:

- `Market Data API`: use this for site-wide candles, quotes, and analysis.
- `Trading API`: use this for one Alpaca paper/live trading account after secure server-side auth.
- `Broker API`: use this only if your app will onboard real end users into brokerage accounts with KYC, agreements, funding, disclosures, and compliance review.

Included backend scaffolds:

- `/api/alpaca-account`
- `/api/alpaca-order-preview`
- `/api/alpaca-order-submit`

Trading API environment variables:

- `ALPACA_API_KEY_ID`
- `ALPACA_API_SECRET_KEY`
- `ALPACA_TRADING_BASE_URL=https://paper-api.alpaca.markets`
- Optional live trading later: `ALPACA_TRADING_BASE_URL=https://api.alpaca.markets`
- Keep disabled by default: `ENABLE_ALPACA_ORDER_SUBMIT=false`

Only set `ENABLE_ALPACA_ORDER_SUBMIT=true` after login, account authorization, buying-power checks, order preview, audit logging, request-id storage, and final manual confirmation are fully designed.

The Alpaca MCP server at `github.com/alpacahq/alpaca-mcp-server` is best treated as private operator tooling for an AI assistant connected to your own Alpaca account. It is not a public website backend for every visitor.

If you want every visitor to have their own real brokerage account, that is a Broker API product decision, not just a code change. You need KYC, customer agreements, funding flows, per-user account ids, compliance review, and account-specific order routing.

Ground News is included as a center-news verification layer. Since Ground News does not expose a public API for direct center-only embedding, the app provides a Ground News search link and query from each analysis result.

Browser storage is still local to each visitor/browser. If you use the site on a different computer, your journal will not automatically follow you unless you export/import JSON or add cloud sync.

## Signup / Login Profiles

The current Signup/Login buttons create local demo profiles in each visitor's browser. They let the OS personalize feedback as Beginner, Pro, or Expert without exposing a backend password system yet.

For real `.com` accounts that follow users across devices, replace the local demo account layer with:

- Supabase Auth + Supabase tables
- Firebase Auth + Firestore
- Vercel Identity + a database
- Custom backend auth with Postgres

Store user profile fields server-side:

- name
- username
- email
- phone
- experience level
- feedback focus
- saved setups
- journal history
- paper trades

Do not store production passwords in browser `localStorage`.

## What Needs A Backend

The Signal Dashboard currently includes browser-side AI/data logic. For real production use, move that behind a private backend.

You need a backend for:

- API keys
- real market data calls
- AI analysis calls
- caching
- rate limits
- user accounts
- cloud journal sync

Never put paid API keys directly in browser JavaScript for a public site.

## Recommended Production Architecture

Static frontend:

- `index.html`
- tool pages
- shared assets

Backend API:

- `/api/market-overview`
- `/api/analyze`
- `/api/journal`
- `/api/watchlist`

The current Vercel build includes a first version of this backend at:

- `/api/analyze?symbol=AAPL`

Database:

- Supabase, Firebase, Turso, or Postgres

Hosting:

- Vercel/Vercel/Cloudflare Pages for frontend
- Vercel Functions, Vercel Functions, Cloudflare Workers, or a small Node server for backend

## Next Upgrade Order

1. Deploy the current static bundle.
2. Add backend proxy for Signal Dashboard.
3. Add login and cloud storage.
4. Add journal sync across devices.
5. Add live market data provider.
6. Add admin/config screen for API provider settings.

