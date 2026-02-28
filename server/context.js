/**
 * Market Sentinel AR - Context Engine (Production Hardened)
 * Market Regime Detection + Strength
 */

const VOLATILITY_THRESHOLD = 0.08;

const ContextEngine = {

  REGIMES: {
    UPTREND: 'UPTREND',
    DOWNTREND: 'DOWNTREND',
    RANGE: 'RANGE',
    VOLATILE: 'VOLATILE'
  },

  /**
   * Determine Market Regime
   * @param {Object} indicators
   * @returns {String}
   */
  determineRegime(indicators = {}) {

    const {
      currentPrice,
      sma20,
      sma200,
      ema20,
      atr,
      avgPrice
    } = indicators;

    // Strong Numeric Guards
    if (
      !Number.isFinite(currentPrice) ||
      !Number.isFinite(avgPrice) ||
      !Number.isFinite(atr)
    ) {
      return this.REGIMES.RANGE;
    }

    // 1️⃣ Volatility First
    const volatilityRatio = avgPrice > 0 ? atr / avgPrice : 0;
    if (volatilityRatio >= VOLATILITY_THRESHOLD) {
      return this.REGIMES.VOLATILE;
    }

    // 2️⃣ Trend Detection (Use EMA20 if available)
    const shortMA = Number.isFinite(ema20) ? ema20 : sma20;

    const hasLongMA = Number.isFinite(sma200);
    const hasShortMA = Number.isFinite(shortMA);

    if (hasLongMA && hasShortMA) {
      if (currentPrice > sma200 && currentPrice > shortMA) return this.REGIMES.UPTREND;
      if (currentPrice < sma200 && currentPrice < shortMA) return this.REGIMES.DOWNTREND;
    }

    return this.REGIMES.RANGE;
  },

  /**
   * Context Strength (percentage distance from short MA)
   * @returns {Number}
   */
  calculateStrength(currentPrice, shortMA) {

    if (
      !Number.isFinite(currentPrice) ||
      !Number.isFinite(shortMA) ||
      shortMA === 0
    ) {
      return 0;
    }

    const distance = ((currentPrice - shortMA) / shortMA) * 100;
    return Math.abs(Number(distance.toFixed(2)));
  }
};

export default ContextEngine;
