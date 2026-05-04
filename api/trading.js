/**
 * Trading API Handler - /api/trading
 * Handles order submission, cancellation, and execution
 */

const AlpacaClient = require('./alpaca-client');

module.exports = async function handler(req, res) {
  try {
    const client = new AlpacaClient();
    const action = req.query.action || 'submit';

    switch (action) {
      case 'submit':
        return handleSubmitOrder(client, req, res);
      
      case 'cancel':
        return handleCancelOrder(client, req, res);
      
      case 'cancel-all':
        return handleCancelAllOrders(client, res);
      
      default:
        return res.status(400).json({ 
          ok: false, 
          error: `Unknown action: ${action}` 
        });
    }
  } catch (error) {
    console.error('[API] Trading error:', error.message);
    return res.status(500).json({ 
      ok: false, 
      error: error.message || 'Trading operation failed' 
    });
  }
};

/**
 * Submit an order with safety checks
 */
async function handleSubmitOrder(client, req, res) {
  try {
    // Check if order submission is enabled
    if (process.env.ENABLE_ALPACA_ORDER_SUBMIT !== 'true') {
      return res.status(403).json({
        ok: false,
        error: 'Order submission is disabled. Set ENABLE_ALPACA_ORDER_SUBMIT=true to enable.',
        warning: 'Paper trading mode: Orders will be simulated'
      });
    }

    const { symbol, qty, side, orderType, limitPrice, stopPrice } = req.body;

    // Validate inputs
    if (!symbol || !qty || !side) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: symbol, qty, side'
      });
    }

    if (qty <= 0) {
      return res.status(400).json({
        ok: false,
        error: 'Order quantity must be greater than 0'
      });
    }

    // Check market hours
    const isOpen = await client.isMarketOpen();
    if (!isOpen) {
      return res.status(403).json({
        ok: false,
        error: 'Market is currently closed. Orders will be queued for next market open.',
        warning: 'Market opens at 9:30 AM ET'
      });
    }

    // Check account balance and PDT compliance
    const account = await client.getAccount();
    
    // Get latest price for risk calculation
    const bars = await client.getLatestBars(symbol);
    const latestPrice = bars[symbol.toUpperCase()]?.c || 0;
    const estimatedCost = latestPrice * qty;

    if (estimatedCost > parseFloat(account.buying_power)) {
      return res.status(403).json({
        ok: false,
        error: `Insufficient buying power. Required: $${estimatedCost.toFixed(2)}, Available: $${account.buying_power}`,
        buyingPower: parseFloat(account.buying_power),
        estimatedCost: estimatedCost
      });
    }

    // Check PDT rule for day traders
    if (account.pattern_day_trader && parseFloat(account.portfolio_value) < 25000) {
      return res.status(403).json({
        ok: false,
        error: 'Pattern Day Trader rule: Minimum $25,000 account balance required',
        portfolioValue: parseFloat(account.portfolio_value)
      });
    }

    // Submit the order
    const order = await client.submitOrder(
      symbol,
      parseInt(qty),
      side,
      orderType || 'market',
      limitPrice ? parseFloat(limitPrice) : null,
      stopPrice ? parseFloat(stopPrice) : null
    );

    return res.json({
      ok: true,
      order: {
        id: order.id,
        symbol: order.symbol,
        qty: parseFloat(order.qty),
        side: order.side,
        type: order.order_type,
        status: order.status,
        createdAt: new Date(order.created_at).toISOString(),
        estimatedCost: estimatedCost,
        message: `${order.order_type.toUpperCase()} order to ${order.side.toUpperCase()} ${order.qty} ${order.symbol}`
      }
    });
  } catch (error) {
    throw new Error(`Order submission failed: ${error.message}`);
  }
}

/**
 * Cancel a specific order
 */
async function handleCancelOrder(client, req, res) {
  try {
    const orderId = req.query.orderId || req.body.orderId;

    if (!orderId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing orderId parameter'
      });
    }

    await client.cancelOrder(orderId);

    return res.json({
      ok: true,
      message: `Order ${orderId} cancelled successfully`
    });
  } catch (error) {
    throw new Error(`Order cancellation failed: ${error.message}`);
  }
}

/**
 * Cancel all open orders
 */
async function handleCancelAllOrders(client, res) {
  try {
    const orders = await client.getOrders('open');
    
    if (orders.length === 0) {
      return res.json({
        ok: true,
        message: 'No open orders to cancel',
        cancelled: []
      });
    }

    const cancelled = [];
    for (const order of orders) {
      try {
        await client.cancelOrder(order.id);
        cancelled.push(order.id);
      } catch (err) {
        console.warn(`Failed to cancel order ${order.id}:`, err.message);
      }
    }

    return res.json({
      ok: true,
      message: `Cancelled ${cancelled.length} of ${orders.length} open orders`,
      cancelled: cancelled
    });
  } catch (error) {
    throw new Error(`Cancel all orders failed: ${error.message}`);
  }
}
