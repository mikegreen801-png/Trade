const { adapt } = require("../vercel-adapter");
const { handler } = require("../netlify/functions/health");

module.exports = (req, res) => adapt(handler, req, res);
