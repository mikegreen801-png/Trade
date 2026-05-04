const { adapt } = require("../vercel-adapter");
const { handler } = require("../netlify/functions/alpaca-order-submit");

module.exports = (req, res) => adapt(handler, req, res);