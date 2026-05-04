const { adapt } = require("../vercel-adapter");
const { handler } = require("../netlify/functions/alpaca-order-preview");

module.exports = (req, res) => adapt(handler, req, res);
