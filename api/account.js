/**
 * Account API Handler - /api/account
 * Manages account information, positions, and order history
 */

const AlpacaClient = require('./alpaca-client');

module.exports = async function handler(req, res) {
  try {
    const isLive = req.query.isLive === 'true';
    const client = new AlpacaClient(isLive, req.headers);
    const action = req.query.action || 'info';

    switch (action) {
      case 'info':
        return handleAccountInfo(client, res);
      
      case 'positions':
        return handlePositions(client, res);
      
      case 'orders':
        return handleOrders(client, req, res);
      
      default:
        return res.status(400).json({ 
          ok: false, 
          error: `Unknown action: ${action}` 
        });
    }
  } catch (error) {
    console.error('[API] Account error:', error.message);
    return res.status(500).json({ 
      ok: false, 
      error: error.message || 'Account operation failed' 
    });
  }
};

/**
 * Get account information
 */
async function handleAccountInfo(client, res) {
  try {
    const account = await client.getAccount();
    
    return res.json({
      ok: true,
      account: {
        accountNumber: account.account_number,
        status: account.status,
        cash: parseFloat(account.cash),
        buyingPower: parseFloat(account.buying_power),
        portfolioValue: parseFloat(account.portfolio_value),
        dayTradesRemaining: account.daytrade_buying_power_check === 'both' 
          ? parseInt(account.daytrading_buying_power) 
          : parseInt(account.daytrade_buying_power_check),
        isPatternDayTrader: account.pattern_day_trader,
        tradingSuspended: account.trading_suspended
      }
    });
  } catch (error) {
    throw new Error(`Failed to fetch account info: ${error.message}`);
  }
}

/**
 * Get all positions
 */
async function handlePositions(client, res) {
  try {
    const positions = await client.getAccountPositions();

    const formattedPositions = positions.map(pos => ({
      symbol: pos.symbol,
      qty: parseInt(pos.qty),
      side: pos.side,
      avgFillPrice: parseFloat(pos.avg_fill_price),
      currentPrice: parseFloat(pos.current_price),
      unrealizedGain: parseFloat(pos.unrealized_gain),
      unrealizedGainPercent: parseFloat(pos.unrealized_gainpct) * 100,
      value: parseFloat(pos.market_value),
      assetId: pos.asset_id
    }));

    return res.json({
      ok: true,
      positions: formattedPositions,
      count: formattedPositions.length
    });
  } catch (error) {
    throw new Error(`Failed to fetch positions: ${error.message}`);
  }
}

/**
 * Get orders
 */
async function handleOrders(client, req, res) {
  try {
    const status = req.query.status || 'all';
    const orders = await client.getOrders(status);

    const formattedOrders = orders.map(order => ({
      id: order.id,
      symbol: order.symbol,
      qty: parseFloat(order.qty),
      filledQty: parseFloat(order.filled_qty),
      side: order.side,
      type: order.order_type,
      timeInForce: order.time_in_force,
      limitPrice: order.limit_price ? parseFloat(order.limit_price) : null,
      stopPrice: order.stop_price ? parseFloat(order.stop_price) : null,
      status: order.status,
      createdAt: new Date(order.created_at).toISOString(),
      filledAt: order.filled_at ? new Date(order.filled_at).toISOString() : null,
      cancelledAt: order.cancelled_at ? new Date(order.cancelled_at).toISOString() : null
    }));

    return res.json({
      ok: true,
      orders: formattedOrders,
      count: formattedOrders.length
    });
  } catch (error) {
    throw new Error(`Failed to fetch orders: ${error.message}`);
  }
}
