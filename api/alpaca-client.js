/**
 * Alpaca API Client - Centralized connection to Alpaca Markets
 * Handles authentication and all trading operations
 */

const https = require('https');

class AlpacaClient {
  constructor() {
    this.apiKey = process.env.ALPACA_API_KEY_ID;
    this.secretKey = process.env.ALPACA_API_SECRET_KEY;
    this.baseUrl = process.env.ALPACA_TRADING_BASE_URL || 'https://paper-api.alpaca.markets';
    this.dataBaseUrl = process.env.ALPACA_DATA_BASE_URL || 'https://data.alpaca.markets';
    
    if (!this.apiKey || !this.secretKey) {
      throw new Error('Missing ALPACA_API_KEY_ID or ALPACA_API_SECRET_KEY in environment');
    }
  }

  /**
   * Generic HTTPS request handler
   */
  async request(method, path, body = null, isData = false) {
    return new Promise((resolve, reject) => {
      const url = new URL((isData ? this.dataBaseUrl : this.baseUrl) + path);
      
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'APCA-API-KEY-ID': this.apiKey,
          'APCA-API-SECRET-KEY': this.secretKey
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              reject({ status: res.statusCode, error: parsed });
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject({ status: res.statusCode, error: data });
          }
        });
      });

      req.on('error', reject);
      
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * Account Operations
   */
  async getAccount() {
    return this.request('GET', '/v2/account');
  }

  async getAccountPositions() {
    return this.request('GET', '/v2/positions');
  }

  async getOrders(status = 'all') {
    return this.request('GET', `/v2/orders?status=${status}&limit=100`);
  }

  async getOrder(orderId) {
    return this.request('GET', `/v2/orders/${orderId}`);
  }

  /**
   * Order Execution
   */
  async submitOrder(symbol, qty, side, orderType = 'market', timeInForce = 'day', limitPrice = null, stopPrice = null) {
    const orderData = {
      symbol: symbol.toUpperCase(),
      qty: qty,
      side: side.toLowerCase(), // 'buy' or 'sell'
      type: orderType.toLowerCase(), // 'market', 'limit', 'stop', 'stop_limit'
      time_in_force: timeInForce // 'day', 'gtc', 'ioc', 'fok'
    };

    if (limitPrice) orderData.limit_price = limitPrice;
    if (stopPrice) orderData.stop_price = stopPrice;

    return this.request('POST', '/v2/orders', orderData);
  }

  async cancelOrder(orderId) {
    return this.request('DELETE', `/v2/orders/${orderId}`);
  }

  async cancelAllOrders() {
    return this.request('DELETE', '/v2/orders');
  }

  /**
   * Market Data
   */
  async getLatestBars(symbols) {
    const symbolStr = Array.isArray(symbols) ? symbols.join(',') : symbols;
    return this.request('GET', `/v2/bars/latest?symbols=${symbolStr}`, null, true);
  }

  async getBarHistory(symbol, timeframe = '1Min', limit = 100) {
    // timeframe: '1Min', '5Min', '15Min', '1H', '1D'
    return this.request('GET', `/v2/bars?symbols=${symbol}&timeframe=${timeframe}&limit=${limit}`, null, true);
  }

  async getTradingCalendar() {
    return this.request('GET', '/v2/calendar');
  }

  async getClock() {
    return this.request('GET', '/v2/clock');
  }

  /**
   * Safety Checks
   */
  async isMarketOpen() {
    const clock = await this.getClock();
    return clock.is_open;
  }

  async isDayTraderCompliant(account) {
    return account.buying_power > 0 && account.portfolio_value >= 25000;
  }
}

module.exports = AlpacaClient;
