const { adapt } = require("../vercel-adapter");
const { handler } = require("../netlify/functions/site-status");

module.exports = (req, res) => adapt(handler, req, res);
