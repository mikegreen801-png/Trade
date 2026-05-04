const { adapt } = require("../vercel-adapter");
const { handler } = require("../netlify/functions/alpaca-account");

module.exports = (req, res) => adapt(handler, req, res);
