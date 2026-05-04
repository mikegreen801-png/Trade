/**
 * Market Data API Handler - /api/market
 * Provides real-time and historical market data
 */

const AlpacaClient = require('./alpaca-client');

module.exports = async function handler(req, res) {
  try {
    const client = new AlpacaClient();
    const action = req.query.action || 'latest';

    switch (action) {
      case 'latest':
        return handleLatestBars(client, req, res);
      
      case 'history':
        return handleBarHistory(client, req, res);
      
      case 'clock':
        return handleClock(client, res);
      
      case 'calendar':
        return handleCalendar(client, res);
      
      default:
        return res.status(400).json({ 
          ok: false, 
          error: `Unknown action: ${action}` 
        });
    }
  } catch (error) {
    console.error('[API] Market data error:', error.message);
    return res.status(500).json({ 
      ok: false, 
      error: error.message || 'Market data operation failed' 
    });
  }
};

/**
 * Get latest bars for symbols
 */
async function handleLatestBars(client, req, res) {
  try {
    const symbols = req.query.symbols;

    if (!symbols) {
      return res.status(400).json({
        ok: false,
        error: 'Missing symbols parameter (e.g., ?symbols=AAPL,MSFT,TSLA)'
      });
    }

    const bars = await client.getLatestBars(symbols);

    const formatted = {};
    for (const [symbol, data] of Object.entries(bars)) {
      formatted[symbol] = {
        symbol: symbol,
        timestamp: data.t * 1000, // Convert Unix timestamp to milliseconds
        open: parseFloat(data.o),
        high: parseFloat(data.h),
        low: parseFloat(data.l),
        close: parseFloat(data.c),
        volume: parseInt(data.v),
        vwap: data.vw ? parseFloat(data.vw) : null
      };
    }

    return res.json({
      ok: true,
      data: formatted,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    throw new Error(`Failed to fetch latest bars: ${error.message}`);
  }
}

/**
 * Get historical bar data
 */
async function handleBarHistory(client, req, res) {
  try {
    const symbol = req.query.symbol;
    const timeframe = req.query.timeframe || '1Day';
    const limit = parseInt(req.query.limit) || 100;

    if (!symbol) {
      return res.status(400).json({
        ok: false,
        error: 'Missing symbol parameter'
      });
    }

    if (limit > 10000) {
      return res.status(400).json({
        ok: false,
        error: 'Maximum limit is 10,000 bars'
      });
    }

    const bars = await client.getBarHistory(symbol, timeframe, limit);

    const formatted = bars[symbol.toUpperCase()].map(bar => ({
      timestamp: bar.t * 1000,
      datetime: new Date(bar.t * 1000).toISOString(),
      open: parseFloat(bar.o),
      high: parseFloat(bar.h),
      low: parseFloat(bar.l),
      close: parseFloat(bar.c),
      volume: parseInt(bar.v),
      vwap: bar.vw ? parseFloat(bar.vw) : null
    }));

    return res.json({
      ok: true,
      symbol: symbol.toUpperCase(),
      timeframe: timeframe,
      bars: formatted,
      count: formatted.length
    });
  } catch (error) {
    throw new Error(`Failed to fetch bar history: ${error.message}`);
  }
}

/**
 * Get market clock
 */
async function handleClock(client, res) {
  try {
    const clock = await client.getClock();

    return res.json({
      ok: true,
      timestamp: new Date(clock.timestamp).toISOString(),
      isOpen: clock.is_open,
      nextOpen: new Date(clock.next_open).toISOString(),
      nextClose: new Date(clock.next_close).toISOString()
    });
  } catch (error) {
    throw new Error(`Failed to fetch market clock: ${error.message}`);
  }
}

/**
 * Get trading calendar
 */
async function handleCalendar(client, res) {
  try {
    const calendar = await client.getTradingCalendar();

    const formatted = calendar.map(day => ({
      date: day.date,
      open: day.open,
      close: day.close,
      sessionOpen: new Date(day.open).toISOString(),
      sessionClose: new Date(day.close).toISOString()
    }));

    return res.json({
      ok: true,
      calendar: formatted,
      count: formatted.length
    });
  } catch (error) {
    throw new Error(`Failed to fetch calendar: ${error.message}`);
  }
}
