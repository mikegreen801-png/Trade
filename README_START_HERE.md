# Start Here

Open `index.html` first. That is the home screen for the toolkit.

## To Run On Your Computer

1. Unzip the folder.
2. Double-click `index.html`.
3. Use the `OS Hub` button in each tool to return home.

## To Put It Online 24/7

Upload the entire folder to a static host.

Use one of these:

- Vercel: easiest drag-and-drop
- Vercel: good if you later add a backend
- Cloudflare Pages: good for fast static hosting
- GitHub Pages: good if you want the files in a repository

The root of the deployed site must contain `index.html`.

Do not upload only the PDFs. The PDFs are resources, not the app.

## Suggested Vercel Flow

1. Go to Vercel in your browser.
2. For the basic static site, upload the full folder contents.
3. For the live public feed, use a Git-connected Vercel site or Vercel CLI so `vercel/functions` deploys.
4. Confirm the project root includes `index.html`, `vercel.toml`, and the `vercel/functions` folder.
5. Vercel publishes a public URL.
6. Open the URL and confirm the home screen appears.

## What Is Already Ready

- Home hub: `index.html`
- Top-left `Home` button on every tool
- Static host config for Vercel
- Static host config for Vercel
- Vercel live-analysis API: `/api/analyze?symbol=AAPL`
- Vercel deployment status API: `/api/site-status`
- PDFs included as downloadable/openable resources
- Interactive strategy playbook and strategy builder
- Journal CSV import/export
- Journal JSON backup/restore

## Live Stock/Crypto Search

The home page includes a stock/crypto search box.

It now has two layers:

1. Static live widgets: TradingView quote/chart and technical rating. These work on normal static hosting and do not need Vercel functions.
2. Optional custom analysis: On Vercel, the page also calls:

`/api/analyze?symbol=AAPL`

That function returns additional quote/news context from public finance feeds and creates an educational `BUY`, `HOLD`, or `SELL` rating. It is not financial advice.

When you open the files locally by double-clicking `index.html`, the TradingView widgets may still load if your browser allows the external widget scripts. The custom Vercel JSON analysis will not run from a plain local file.

If the page says the live endpoint is unavailable, open this URL on your deployed site:

`/api/health`

If that does not return JSON with `"ok": true`, Vercel did not deploy the functions. Redeploy from the full folder through a Vercel site connected to the project files. A purely static drag/drop deploy may not enable functions on every Vercel flow.

Also test:

`/api/site-status`

That page tells you whether the public server routes are online and whether Alpaca market data keys are configured.

Alpaca endpoint map:

- Market data: `https://data.alpaca.markets`
- Paper trading account/orders: `https://paper-api.alpaca.markets`
- Live trading account/orders: `https://api.alpaca.markets`

Start with paper keys and keep live order submit locked.

## Ground News / Center News

The analysis panel includes a `Center News Check` section. Ground News does not provide a public embed/API for center-only results, so the app links you into Ground News search with the exact query to use.

Use that Ground News result to compare source bias and prioritize center-weighted coverage before acting on market-moving headlines.

## What Comes Next For Real Live Data

The static version works 24/7, but live AI/market data needs a backend so API keys stay private.

Recommended next build:

- `/api/market-overview`
- `/api/analyze`
- private server-side API keys
- cloud storage for journal/watchlist sync

