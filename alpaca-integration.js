/**
 * Alpaca Integration Library - Frontend JavaScript
 * Include this in your HTML to access Alpaca APIs easily
 * 
 * Usage:
 *   <script src="/alpaca-integration.js"></script>
 *   <script>
 *     alpacaAPI.getAccount().then(acc => console.log(acc));
 *   </script>
 */

const alpacaAPI = {
  baseUrl: '/api',
  liveMode: false,

  /**
   * Generic API call wrapper
   */
  async call(endpoint, method = 'GET', body = null, query = {}) {
    const params = new URLSearchParams(query).toString();
    const url = `${this.baseUrl}${endpoint}${params ? '?' + params : ''}`;

    try {
      const options = {
        method: method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok && !data.ok) {
        throw new Error(data.error || `API Error: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`[Alpaca API] ${endpoint} failed:`, error.message);
      throw error;
    }
  },

  /**
   * ACCOUNT OPERATIONS
   */

  async getAccount() {
    return this.call('/account', 'GET', null, { action: 'info' });
  },

  async getPositions() {
    return this.call('/account', 'GET', null, { action: 'positions' });
  },

  async getOrders(status = 'all') {
    return this.call('/account', 'GET', null, { action: 'orders', status: status });
  },

  /**
   * TRADING OPERATIONS
   */

  async submitOrder(symbol, qty, side, orderType = 'market', limitPrice = null, stopPrice = null) {
    if (!this.liveMode && orderType !== 'market') {
      console.warn('[Alpaca] Paper trading: limit/stop orders may behave differently');
    }

    const body = {
      symbol: symbol.toUpperCase(),
      qty: qty,
      side: side.toLowerCase(),
      orderType: orderType.toLowerCase(),
      limitPrice: limitPrice,
      stopPrice: stopPrice
    };

    return this.call('/trading', 'POST', body, { action: 'submit' });
  },

  async buyMarket(symbol, qty) {
    return this.submitOrder(symbol, qty, 'buy', 'market');
  },

  async sellMarket(symbol, qty) {
    return this.submitOrder(symbol, qty, 'sell', 'market');
  },

  async buyLimit(symbol, qty, limitPrice) {
    return this.submitOrder(symbol, qty, 'buy', 'limit', limitPrice);
  },

  async sellLimit(symbol, qty, limitPrice) {
    return this.submitOrder(symbol, qty, 'sell', 'limit', limitPrice);
  },

  async cancelOrder(orderId) {
    return this.call('/trading', 'POST', null, { action: 'cancel', orderId: orderId });
  },

  async cancelAllOrders() {
    return this.call('/trading', 'POST', null, { action: 'cancel-all' });
  },

  /**
   * MARKET DATA
   */

  async getLatestBars(symbols) {
    // symbols can be string "AAPL" or array ["AAPL", "MSFT"]
    const symbolStr = Array.isArray(symbols) ? symbols.join(',') : symbols;
    return this.call('/market', 'GET', null, { action: 'latest', symbols: symbolStr });
  },

  async getLatestPrice(symbol) {
    const result = await this.getLatestBars(symbol);
    return result.data[symbol.toUpperCase()]?.close || null;
  },

  async getBarHistory(symbol, timeframe = '1Day', limit = 100) {
    return this.call('/market', 'GET', null, { 
      action: 'history', 
      symbol: symbol.toUpperCase(), 
      timeframe: timeframe, 
      limit: limit 
    });
  },

  async getMarketClock() {
    return this.call('/market', 'GET', null, { action: 'clock' });
  },

  async isMarketOpen() {
    const clock = await this.getMarketClock();
    return clock.isOpen;
  },

  async getTradingCalendar() {
    return this.call('/market', 'GET', null, { action: 'calendar' });
  },

  /**
   * UTILITY FUNCTIONS
   */

  setLiveMode(enabled) {
    if (enabled) {
      const confirmed = confirm(
        '⚠️ WARNING: LIVE TRADING MODE\n\n' +
        'You are about to enable LIVE TRADING with REAL MONEY.\n\n' +
        'Proceed only if you:\n' +
        '- Have tested thoroughly on paper trading\n' +
        '- Understand the risks\n' +
        '- Can afford losses\n\n' +
        'Continue?'
      );
      this.liveMode = confirmed;
      if (confirmed) {
        console.warn('%c🔴 LIVE MODE ACTIVE - REAL MONEY TRADING ENABLED', 'color: red; font-weight: bold; font-size: 16px;');
      }
    } else {
      this.liveMode = false;
      console.log('Paper trading mode enabled');
    }
    return this.liveMode;
  },

  /**
   * Calculate position size based on risk
   */
  calculatePositionSize(currentPrice, riskAmount, entryPrice, stopPrice) {
    if (!currentPrice || !riskAmount) return 0;
    
    const riskPerShare = Math.abs(entryPrice - stopPrice);
    if (riskPerShare === 0) return 0;
    
    return Math.floor(riskAmount / riskPerShare);
  },

  /**
   * Calculate R:R ratio
   */
  calculateRiskReward(entryPrice, stopPrice, targetPrice) {
    const risk = Math.abs(entryPrice - stopPrice);
    const reward = Math.abs(targetPrice - entryPrice);
    return risk > 0 ? (reward / risk).toFixed(2) : 0;
  },

  /**
   * Format currency
   */
  formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  },

  /**
   * Format percentage
   */
  formatPercent(value) {
    return (value * 100).toFixed(2) + '%';
  }
};

// Make available globally
if (typeof window !== 'undefined') {
  window.alpacaAPI = alpacaAPI;
}

// Also export for Node.js/modules if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = alpacaAPI;
}
