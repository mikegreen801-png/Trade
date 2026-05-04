async function readBody(req) {
  if (req.body === undefined || req.body === null) return "";
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  return JSON.stringify(req.body);
}

function normalizeQuery(query = {}) {
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
  );
}

async function adapt(handler, req, res) {
  const result = await handler({
    httpMethod: req.method || "GET",
    queryStringParameters: normalizeQuery(req.query || {}),
    headers: req.headers || {},
    body: await readBody(req)
  });

  Object.entries(result.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
  res.status(result.statusCode || 200).send(result.body || "");
}

module.exports = { adapt };
