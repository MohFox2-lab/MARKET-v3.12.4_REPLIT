// Minimal technical indicators (no external deps)

export function sma(values, period) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out.push(sum / period);
  }
  return out;
}

export function ema(values, period) {
  const out = [];
  const k = 2 / (period + 1);
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(values, period = 14) {
  const out = [];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  out.push(100 - 100 / (1 + (loss === 0 ? 100 : gain / loss)));
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    const rs = loss === 0 ? 100 : gain / loss;
    out.push(100 - 100 / (1 + rs));
  }
  // pad to align length
  const pad = Array(Math.max(0, values.length - out.length)).fill(out[0]);
  return pad.concat(out).slice(-values.length);
}

export function atr(highs, lows, closes, period = 14) {
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  // simple EMA of TR
  const atrs = ema(trs, period);
  // pad
  return [atrs[0], ...atrs];
}

export function bollinger(values, period = 20, stdMult = 2) {
  const mid = sma(values, period);
  const upper = [];
  const lower = [];
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = mid[i - (period - 1)];
    const variance = slice.reduce((a, v) => a + (v - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper.push(mean + stdMult * sd);
    lower.push(mean - stdMult * sd);
  }
  const padLen = values.length - upper.length;
  return {
    mid: Array(padLen).fill(mid[0]).concat(mid).slice(-values.length),
    upper: Array(padLen).fill(upper[0]).concat(upper).slice(-values.length),
    lower: Array(padLen).fill(lower[0]).concat(lower).slice(-values.length),
  };
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);
  const macdLine = values.map((_, i) => fastE[i] - slowE[i]);
  const signalLine = ema(macdLine, signal);
  const hist = macdLine.map((v, i) => v - signalLine[i]);
  return { macd: macdLine, signal: signalLine, hist };
}

export function maxN(arr) {
  return arr.reduce((m, v) => (v > m ? v : m), -Infinity);
}

export function minN(arr) {
  return arr.reduce((m, v) => (v < m ? v : m), Infinity);
}
/**
 * Market Sentinel AR - Indicator Engine
 * Safe + Explainable calculations
 * Input candles: [{open, high, low, close, volume, ts}]
 */
export const Indicators = {
  // SMA of closes
  smaClose(candles, period = 20) {
    if (!Array.isArray(candles) || candles.length < period) return null;
    const slice = candles.slice(-period);
    const sum = slice.reduce((acc, c) => acc + (Number(c?.close) || 0), 0);
    return sum / period;
  },

  // EMA of closes (needed for EMA20 logic)
  emaClose(candles, period = 20) {
    if (!Array.isArray(candles) || candles.length < period) return null;
    const k = 2 / (period + 1);
    let emaVal = Number(candles[0]?.close);
    if (!Number.isFinite(emaVal)) {
      // find first finite close
      for (const c of candles) {
        const v = Number(c?.close);
        if (Number.isFinite(v)) { emaVal = v; break; }
      }
      if (!Number.isFinite(emaVal)) return null;
    }
    for (let i = 1; i < candles.length; i++) {
      const close = Number(candles[i]?.close);
      if (!Number.isFinite(close)) continue;
      emaVal = close * k + emaVal * (1 - k);
    }
    return emaVal;
  },

  // RSI (Wilder style simplified, safe) -> returns a single value (0..100)
  rsi(candles, period = 14) {
    if (!Array.isArray(candles) || candles.length <= period) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = candles.length - period; i < candles.length; i++) {
      const prev = Number(candles[i - 1]?.close);
      const curr = Number(candles[i]?.close);
      if (!Number.isFinite(prev) || !Number.isFinite(curr)) continue;

      const diff = curr - prev;
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }

    if (gains === 0 && losses === 0) return 50;
    if (losses === 0) return 100;

    const rs = (gains / period) / (losses / period);
    const out = 100 - 100 / (1 + rs);
    return Math.max(0, Math.min(100, out));
  },

  // Volume Ratio (ratio like 2.5, NOT percent)
  volRatio(candles, period = 20) {
    if (!Array.isArray(candles) || candles.length < period + 1) return null;

    const currVol = Number(candles[candles.length - 1]?.volume);
    if (!Number.isFinite(currVol)) return null;

    const prevSlice = candles.slice(-(period + 1), -1);
    const vols = prevSlice.map(c => Number(c?.volume)).filter(Number.isFinite);

    if (vols.length < Math.floor(period * 0.7)) return null;
    const avgVol = vols.reduce((a, v) => a + v, 0) / vols.length;

    if (!Number.isFinite(avgVol) || avgVol <= 0) return null;
    return currVol / avgVol;
  },

  // ATR (safe)
  atr(candles, period = 14) {
    if (!Array.isArray(candles) || candles.length < period + 1) return null;

    let trSum = 0;
    let count = 0;

    for (let i = candles.length - period; i < candles.length; i++) {
      const c = candles[i];
      const prev = candles[i - 1];
      if (!prev) continue;

      const h = Number(c?.high), l = Number(c?.low), pc = Number(prev?.close);
      if (![h, l, pc].every(Number.isFinite)) continue;

      const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
      trSum += tr;
      count++;
    }

    if (count === 0) return null;
    return trSum / count;
  }
};

export default Indicators;
