const headers = {
  "access-control-allow-origin": "*",
  "content-type": "application/json",
  "cache-control": "no-store"
};

function hasValue(value) {
  return Boolean(String(value || "").trim());
}

exports.handler = async () => {
  const hasAlpacaKeys =
    hasValue(process.env.ALPACA_API_KEY_ID || process.env.APCA_API_KEY_ID) &&
    hasValue(process.env.ALPACA_API_SECRET_KEY || process.env.APCA_API_SECRET_KEY);
  const tradingBaseUrl = (process.env.ALPACA_TRADING_BASE_URL || "https://paper-api.alpaca.markets").replace(/\/+$/, "");
  const marketDataBaseUrl = (process.env.ALPACA_DATA_BASE_URL || "https://data.alpaca.markets").replace(/\/+$/, "");
  const orderSubmitEnabled = String(process.env.ENABLE_ALPACA_ORDER_SUBMIT || "false").toLowerCase() === "true";

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      publicServer: true,
      generatedAt: new Date().toISOString(),
      routes: {
        home: "/",
        health: "/api/health",
        siteStatus: "/api/site-status",
        analyze: "/api/analyze?symbol=AAPL",
        orderPreview: "/api/alpaca-order-preview",
        brokerPlan: "/broker_execution_plan"
      },
      alpaca: {
        marketDataConfigured: hasAlpacaKeys,
        marketDataBaseUrl,
        tradingBaseUrl,
        mode: tradingBaseUrl.includes("paper") ? "paper" : "live",
        orderSubmitEnabled,
        expectedEndpoints: {
          liveTrading: "https://api.alpaca.markets",
          paperTrading: "https://paper-api.alpaca.markets",
          marketData: "https://data.alpaca.markets"
        }
      },
      notes: [
        "Market data can be served through /api/analyze so keys stay private on Vercel.",
        "Live order submit should stay disabled until auth, preview, buying-power checks, request-id logging, and final confirmation are complete.",
        "If /api/analyze returns data, public visitors can use the hosted feed without their browser calling Yahoo or Alpaca directly."
      ]
    }, null, 2)
  };
};
