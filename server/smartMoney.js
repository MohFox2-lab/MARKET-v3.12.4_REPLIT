/**
 * Market Sentinel AR - Smart Money Engine (Quiet Accumulation Model)
 * Purpose: Detect institutional-style quiet accumulation without day-trading behavior.
 * Output: smart_money_score (0..100) + state + reasons + flags
 *
 * Inputs (daily candles):
 * candles: [{ open, high, low, close, volume, ts }]
 * indicators: { ema20, sma50, atr14, rsi14, vol_ratio20, regime, confidence, market_change_pct }
 */

const SmartMoney = {
  STATES: {
    QUIET_ACCUMULATION: "QUIET_ACCUMULATION", // تجميع هادئ
    EARLY_BUILD: "EARLY_BUILD",               // بداية بناء مراكز
    NEUTRAL: "NEUTRAL",                       // لا إشارة قوية
    DISTRIBUTION: "DISTRIBUTION"              // تصريف / توزيع
  },

  analyze({ candles = [], indicators = {}, settings = {} } = {}) {

    const cfg = SmartMoney._mergeConfig(settings);

    // Guards
    if (!Array.isArray(candles) || candles.length < cfg.min_candles) {
      return SmartMoney._result({
        score: 0,
        state: SmartMoney.STATES.NEUTRAL,
        reasons: ["بيانات غير كافية لتحليل التجميع الهادئ."],
        flags: ["SM_NO_DATA"]
      });
    }

    const w = candles.slice(-cfg.window_days);
    const last = candles[candles.length - 1] || {};
    const lastClose = Number(last.close);

    const {
      atr14,
      rsi14,
      regime,
      confidence,
      market_change_pct
    } = indicators;

    const reasons = [];
    const flags = [];

    // 1) PRICE COMPRESSION (tight range)
    const rangePct = SmartMoney._rangePct(w);
    const compressionScore = SmartMoney._scoreCompression(rangePct, cfg);
    if (compressionScore >= 70) reasons.push(`ضغط سعري واضح: نطاق ${rangePct.toFixed(2)}% خلال آخر ${cfg.window_days} يوم.`);

    // 2) ATR LOW (quiet volatility)
    const atrRatio = (Number.isFinite(atr14) && lastClose > 0) ? (atr14 / lastClose) : null;
    const atrScore = SmartMoney._scoreAtrQuiet(atrRatio, cfg);
    if (atrScore >= 70) reasons.push("تذبذب منخفض (ATR منخفض) يشير لتجميع هادئ.");

    // 3) Distribution filter (avoid false optimism)
    const distributionScore = SmartMoney._distributionScore(w, cfg);
    if (distributionScore >= 70) {
      flags.push("SM_DISTRIBUTION_RISK");
      reasons.push("تحذير: نمط قد يشير إلى تصريف (تذبذب/إغلاق ضعيف).");
    }

    // 4) RSI hot filter
    if (Number.isFinite(rsi14) && rsi14 >= cfg.rsi_hot) {
      flags.push("SM_RSI_HOT");
      reasons.push(`RSI مرتفع (${Math.round(rsi14)}) — قد يكون زخمًا وليس تجميعًا هادئًا.`);
    }

    // 5) Relative strength (optional)
    const rsScore = SmartMoney._scoreRelativeStrength(market_change_pct, w, cfg);
    if (rsScore >= 70 && typeof market_change_pct === "number") {
      reasons.push(`قوة نسبية مقارنة بالسوق: السوق ${market_change_pct.toFixed(2)}%.`);
    }

    // Confidence / Regime soft adjustment
    let confidenceAdj = 0;
    if (confidence === "LOW") confidenceAdj -= 10;
    if (regime === "DOWNTREND") confidenceAdj -= 5;
    if (regime === "UPTREND") confidenceAdj += 3;

    // Compose conservative score
    const rawScore =
      compressionScore * 0.34 +
      atrScore * 0.28 +
      rsScore * 0.18 +
      (100 - distributionScore) * 0.20;

    let score = SmartMoney._clamp0_100(rawScore + confidenceAdj);

    if (distributionScore >= 70) score = Math.max(0, score - 20);
    if (flags.includes("SM_RSI_HOT")) score = Math.max(0, score - 10);

    const state = SmartMoney._stateFromScore(score, { distributionScore });

    if (reasons.length === 0) reasons.push("لا توجد علامات قوية لتجميع هادئ حاليًا.");

    return SmartMoney._result({
      score,
      state,
      reasons: SmartMoney._pickTopReasons(reasons, 3),
      flags
    });
  },

  _mergeConfig(settings) {
    const defaults = {
      min_candles: 60,
      window_days: 25,
      compression_good_pct: 7.0,
      compression_ok_pct: 10.0,
      atr_quiet_good: 0.02,
      atr_quiet_ok: 0.03,
      rsi_hot: 72,
      rs_market_drop_good: -2.0,
      rs_stock_stable_pct: -0.8
    };
    return { ...defaults, ...(settings || {}) };
  },

  _rangePct(candles) {
    const highs = candles.map(c => Number(c.high)).filter(Number.isFinite);
    const lows = candles.map(c => Number(c.low)).filter(Number.isFinite);
    if (!highs.length || !lows.length) return 999;
    const hi = Math.max(...highs);
    const lo = Math.min(...lows);
    const mid = (hi + lo) / 2;
    if (mid <= 0) return 999;
    return ((hi - lo) / mid) * 100;
  },

  _scoreCompression(rangePct, cfg) {
    if (!Number.isFinite(rangePct)) return 0;
    if (rangePct <= cfg.compression_good_pct) return 90;
    if (rangePct <= cfg.compression_ok_pct) return 70;
    if (rangePct <= cfg.compression_ok_pct * 1.4) return 50;
    return 20;
  },

  _scoreAtrQuiet(atrRatio, cfg) {
    if (!Number.isFinite(atrRatio)) return 0;
    if (atrRatio <= cfg.atr_quiet_good) return 90;
    if (atrRatio <= cfg.atr_quiet_ok) return 70;
    if (atrRatio <= cfg.atr_quiet_ok * 1.5) return 45;
    return 15;
  },

  _scoreRelativeStrength(market_change_pct, candlesWindow, cfg) {
    if (typeof market_change_pct !== "number") return 50;
    const first = Number(candlesWindow[0]?.close);
    const last = Number(candlesWindow[candlesWindow.length - 1]?.close);
    if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) return 50;
    const stockChangePct = ((last - first) / first) * 100;

    if (market_change_pct <= cfg.rs_market_drop_good && stockChangePct >= cfg.rs_stock_stable_pct) return 85;
    if (market_change_pct >= 1 && stockChangePct >= 1) return 65;
    if (market_change_pct <= -2 && stockChangePct <= -3) return 20;
    return 50;
  },

  _distributionScore(candles) {
    const rangePct = SmartMoney._rangePct(candles);
    let weakCloses = 0;
    let total = 0;
    for (const c of candles) {
      const h = Number(c.high), l = Number(c.low), cl = Number(c.close);
      if (![h, l, cl].every(Number.isFinite) || h === l) continue;
      total++;
      const pos = (cl - l) / (h - l);
      if (pos <= 0.25) weakCloses++;
    }
    const weakRatio = total ? (weakCloses / total) : 0;
    let score = 0;
    if (rangePct >= 12) score += 40;
    if (weakRatio >= 0.45) score += 40;
    if (rangePct >= 16) score += 20;
    return SmartMoney._clamp0_100(score);
  },

  _stateFromScore(score, { distributionScore }) {
    if (distributionScore >= 70) return SmartMoney.STATES.DISTRIBUTION;
    if (score >= 80) return SmartMoney.STATES.QUIET_ACCUMULATION;
    if (score >= 65) return SmartMoney.STATES.EARLY_BUILD;
    return SmartMoney.STATES.NEUTRAL;
  },

  _result({ score, state, reasons, flags }) {
    return {
      smart_money_score: Math.round(score),
      smart_money_state: state,
      reasons: reasons || [],
      flags: flags || []
    };
  },

  _pickTopReasons(reasons, max = 3) {
    return reasons.slice(0, max);
  },

  _clamp0_100(x) {
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(100, x));
  }
};

export default SmartMoney;
