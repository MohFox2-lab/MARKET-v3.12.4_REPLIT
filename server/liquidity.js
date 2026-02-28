/**
 * Market Sentinel AR - Liquidity Rules Engine (v3.12.x addon)
 * قواعد محافظة لتحليل السيولة والتدفق بدون AI
 * يعتمد على بيانات الشموع (OHLCV) فقط.
 */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function avg(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const nums = arr.map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * analyzeLiquidity({ candles }) =>
 * {
 *  liquidity_score: 0..100,
 *  liquidity_grade: "A|B|C|D",
 *  dollar_volume,
 *  avg_dollar_volume20,
 *  vol_ratio20,
 *  flags: [],
 *  reasons: []
 * }
 */
export function analyzeLiquidity({ candles }) {
  const out = {
    liquidity_score: 50,
    liquidity_grade: 'D',
    dollar_volume: 0,
    avg_dollar_volume20: 0,
    vol_ratio20: 0,
    flags: [],
    reasons: [],
  };

  if (!Array.isArray(candles) || candles.length < 5) {
    out.reasons.push('بيانات الشموع غير كافية لحساب السيولة.');
    out.liquidity_score = 40;
    out.liquidity_grade = 'D';
    return out;
  }

  const last = candles[candles.length - 1] || {};
  const prev = candles[candles.length - 2] || {};

  const lastClose = toNum(last.close);
  const lastVol = toNum(last.volume);
  const lastOpen = toNum(last.open);
  const lastHigh = toNum(last.high);
  const lastLow = toNum(last.low);
  const prevClose = toNum(prev.close);

  // 20-day averages
  const tail20 = candles.slice(-20);
  const avgVol20 = avg(tail20.map(c => c.volume));
  const avgClose20 = avg(tail20.map(c => c.close));

  const dollarVol = (lastClose != null && lastVol != null) ? (lastClose * lastVol) : 0;
  const avgDollarVol20 = (avgClose20 != null && avgVol20 != null) ? (avgClose20 * avgVol20) : 0;
  const volRatio20 = (lastVol != null && avgVol20 != null && avgVol20 > 0) ? (lastVol / avgVol20) : 0;

  out.dollar_volume = Number.isFinite(dollarVol) ? dollarVol : 0;
  out.avg_dollar_volume20 = Number.isFinite(avgDollarVol20) ? avgDollarVol20 : 0;
  out.vol_ratio20 = Number.isFinite(volRatio20) ? volRatio20 : 0;

  // Grade by avg dollar volume
  let grade = 'D';
  if (out.avg_dollar_volume20 >= 50_000_000) grade = 'A';
  else if (out.avg_dollar_volume20 >= 15_000_000) grade = 'B';
  else if (out.avg_dollar_volume20 >= 5_000_000) grade = 'C';
  out.liquidity_grade = grade;

  // Flags
  if (out.vol_ratio20 >= 3) {
    out.flags.push('LIQ_VOLUME_SPIKE');
    out.reasons.push(`قفزة حجم: VolRatio20=${out.vol_ratio20.toFixed(2)} (≥ 3).`);
  }

  if (grade === 'D') {
    out.flags.push('LIQ_THIN_LIQUIDITY');
    out.reasons.push('سيولة ضعيفة جدًا (Grade D) — قابلية أعلى للتذبذب والمصائد.');
  }

  if (lastOpen != null && prevClose != null && prevClose > 0) {
    const gap = Math.abs((lastOpen - prevClose) / prevClose);
    if (gap >= 0.04) {
      out.flags.push('LIQ_GAP_RISK');
      out.reasons.push(`فجوة سعرية كبيرة: ${(gap * 100).toFixed(1)}٪ (≥ 4٪).`);
    }
  }

  // 3-day pump/dump proxy
  const tail4 = candles.slice(-4);
  if (tail4.length >= 4) {
    const c0 = toNum(tail4[0]?.close);
    const c3 = lastClose;
    if (c0 != null && c3 != null && c0 > 0) {
      const ch3 = (c3 - c0) / c0;
      const closeNearHigh = (lastHigh != null && c3 >= lastHigh * 0.97);
      const closeNearLow = (lastLow != null && c3 <= lastLow * 1.03);
      const explosiveVol = out.vol_ratio20 >= 2.5;

      if (ch3 >= 0.08 && explosiveVol && closeNearHigh) {
        out.flags.push('LIQ_PUMP_RISK');
        out.reasons.push('نمط Pump محتمل: صعود قوي خلال 3 أيام + حجم انفجاري + إغلاق قرب القمة.');
      }
      if (ch3 <= -0.08 && explosiveVol && closeNearLow) {
        out.flags.push('LIQ_DUMP_RISK');
        out.reasons.push('نمط Dump محتمل: هبوط قوي خلال 3 أيام + حجم انفجاري + إغلاق قرب القاع.');
      }
    }
  }

  // Score
  const base = ({ A: 85, B: 70, C: 55, D: 35 })[grade] ?? 35;
  let score = base;
  if (out.flags.includes('LIQ_THIN_LIQUIDITY')) score -= 15;
  if (out.flags.includes('LIQ_VOLUME_SPIKE')) score -= 10;
  if (out.flags.includes('LIQ_GAP_RISK')) score -= 8;
  if (out.flags.includes('LIQ_PUMP_RISK')) score -= 12;
  if (out.flags.includes('LIQ_DUMP_RISK')) score -= 12;

  out.liquidity_score = clamp(Math.round(score), 0, 100);

  // Keep reasons concise (UI will show top 3)
  out.reasons = out.reasons.slice(0, 6);
  return out;
}

export default { analyzeLiquidity };
