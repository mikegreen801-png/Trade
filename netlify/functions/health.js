exports.handler = async () => ({
  statusCode: 200,
  headers: {
    "content-type": "application/json",
    "cache-control": "no-store"
  },
  body: JSON.stringify({
    ok: true,
    service: "Day Trader OS live functions",
    siteMode: process.env.DTO_SITE_MODE || "paper",
    now: new Date().toISOString()
  })
});
