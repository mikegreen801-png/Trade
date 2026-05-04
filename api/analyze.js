const { adapt } = require("../vercel-adapter");
const { handler } = require("../netlify/functions/analyze");

module.exports = (req, res) => adapt(handler, req, res);
