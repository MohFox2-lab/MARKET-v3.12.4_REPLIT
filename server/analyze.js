import ContextEngine from './context.js';
import SmartMoney from './smartMoney.js';
import { getMarketData } from './marketData.js';
import { resolveRefs, DEFAULT_BENCHMARKS } from './crossMarketMap.js';
import { analyzeLiquidity } from './liquidity.js';
import {
  sma,
  ema,
  rsi,
  atr,
  bollinger,
  macd,
  maxN,
  minN,
} from './indicators.js';


function parseCandleTs(c) {
  if (!c || !c.t) return null;
  // Daily candles: YYYY-MM-DD
  if (typeof c.t === 'string' && c.t.length === 10 && c.t.includes('-')) {
    const ms = Date.parse(c.t + 'T00:00:00Z');
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(String(c.t));
  return Number.isFinite(ms) ? ms : null;
}

function computeMissingDaysRatio(candles) {
  if (!Array.isArray(candles) || candles.length < 10) return null;
  const first = parseCandleTs(candles[0]);
  const last = parseCandleTs(candles[candles.length - 1]);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return null;
  const daysSpan = Math.max(1, Math.round((last - first) / (24*60*60*1000)));
  // trading days roughly ~70% of calendar days; we use conservative expected to detect large gaps.
  const expected = Math.max(1, Math.round(daysSpan * 0.65));
  const missing = Math.max(0, expected - candles.length);
  return missing / expected;
}

function downgradeConfidence(conf) {
  if (conf === 'HIGH') return 'MED';
  if (conf === 'MED') return 'LOW';
  return 'LOW';
}


// ------------------------------
// Iceberg Detection (PRO Intraday) — A09
// ------------------------------
function detectIceberg({ intradayCandles }) {
  if (!Array.isArray(intradayCandles) || intradayCandles.length < 30) return { triggered: false };

  // Use last 120 candles (enough for 1m/5m session)
  const c = intradayCandles.slice(-120).map(x => ({
    high: Number(x.high),
    low: Number(x.low),
    close: Number(x.close),
    open: Number(x.open),
    volume: Number(x.volume || 0),
  })).filter(x => Number.isFinite(x.close) && Number.isFinite(x.high) && Number.isFinite(x.low));

  if (c.length < 30) return { triggered: false };

  const highs = c.map(x => x.high);
  const lows = c.map(x => x.low);
  const closes = c.map(x => x.close);
  const vols = c.map(x => x.volume);

  const atr14 = atr(highs, lows, closes, 14);
  const atrNow = Number.isFinite(atr14) ? Number(atr14) : null;
  if (!atrNow || atrNow <= 0) return { triggered: false };

  // Vol ratio (last vol vs avg 20)
  const avgVol20 = vols.slice(-20).reduce((a,b)=>a+b,0) / Math.max(1, Math.min(20, vols.length));
  const volRatio = (avgVol20 > 0) ? (vols[vols.length - 1] / avgVol20) : 0;

  // 2.1 Price Compression streak
  let streak = 0;
  let maxStreak = 0;
  for (let i = c.length - 1; i >= 0; i--) {
    const range = (c[i].high - c[i].low);
    const rr = range / atrNow;
    if (rr < 0.6) {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      break; // we only care about the most recent compression
    }
  }

  const compressionOk = maxStreak >= 8;

  // 2.2 Volume Absorption + stalled price
  const recentCloses = closes.slice(-maxStreak || -12);
  const meanClose = recentCloses.reduce((a,b)=>a+b,0) / Math.max(1, recentCloses.length);
  const variance = recentCloses.reduce((a,b)=>a+Math.pow(b-meanClose,2),0) / Math.max(1, recentCloses.length);
  const stdClose = Math.sqrt(variance);

  const stalledPrice = stdClose <= (atrNow * 0.25); // closes around same level
  const noProgress = Math.abs(closes[closes.length - 1] - closes[Math.max(0, closes.length - 10)]) <= (atrNow * 0.35);

  const absorptionOk = (volRatio >= 2) && stalledPrice && noProgress;

  // 2.3 Stalled Breakout (failed attempts above resistance)
  const lookback = 40;
  const recent = c.slice(-lookback);
  const prevHigh = Math.max(...recent.slice(0, Math.max(1, recent.length - 10)).map(x => x.high));
  let failed = 0;
  for (let i = recent.length - 10; i < recent.length; i++) {
    if (i < 0) continue;
    const hi = recent[i].high;
    const cl = recent[i].close;
    const vi = recent[i].volume;
    const vRatioI = avgVol20 > 0 ? (vi / avgVol20) : 0;
    if (hi >= prevHigh * 0.999 && cl < prevHigh && vRatioI >= 1.6) {
      failed += 1;
    }
  }
  const stalledBreakoutOk = failed >= 2;

  const triggered = (compressionOk && absorptionOk) || (absorptionOk && stalledBreakoutOk);

  if (!triggered) return { triggered: false };

  const reasons = [];
  if (volRatio >= 2) reasons.push('حجم مرتفع دون تقدم سعري');
  if (compressionOk) reasons.push('انضغاط نطاق التداول');
  if (stalledBreakoutOk) reasons.push('ضغط بيع مخفي عند مستوى مقاومة');

  return {
    triggered: true,
    vol_ratio_intraday: Number.isFinite(volRatio) ? Number(volRatio.toFixed(2)) : null,
    compression_bars: maxStreak,
    failed_breakouts: failed,
    reasons: reasons.length ? reasons : ['حجم مرتفع دون تقدم سعري'],
  };
}

function computeDataQuality({ data, market, tf, provider_used, effectiveMode }) {
  const candles = data?.candles || [];
  const intraday = data?.intraday || null;
  const now = Date.now();

  const lastDailyMs = candles.length ? parseCandleTs(candles[candles.length - 1]) : null;
  const lastIntraMs = (Array.isArray(intraday) && intraday.length) ? parseCandleTs(intraday[intraday.length - 1]) : null;

  const lastMs = (effectiveMode === 'pro' && lastIntraMs) ? lastIntraMs : lastDailyMs;
  const lagMinutes = (Number.isFinite(lastMs)) ? Math.max(0, Math.round((now - lastMs) / 60000)) : null;

  return {
    provider_used: provider_used || data?.provider || null,
    is_free_mode: effectiveMode !== 'pro',
    last_candle_ts: Number.isFinite(lastMs) ? new Date(lastMs).toISOString() : null,
    lag_minutes: lagMinutes,
    missing_days_ratio: computeMissingDaysRatio(candles),
    integrity_flags: Array.isArray(data?.integrity_flags) ? data.integrity_flags.slice(0) : [],
  };
}


function safePct(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function getBenchmarksContext({ market, mode }) {
  const m = String(market || "").toUpperCase();
  const list = DEFAULT_BENCHMARKS[m] || [];
  const out = [];
  for (const sym of list) {
    try {
      const d = await getMarketData({ symbol: sym, market: 'US', tf: 'D', provider: 'yahoo_free', mode });
      const ch = safePct(d?.quote?.changePercent);
      out.push({ symbol: sym, change_pct: ch });
    } catch (_) {
      out.push({ symbol: sym, change_pct: null });
    }
  }
  const primary = out[0] || null;
  return { primary, refs: out.slice(1) };
}

async function getRefsChanges({ symbol, market, mode }) {
  const refs = resolveRefs({ symbol, market }) || [];
  const out = [];
  for (const sym of refs) {
    try {
      const d = await getMarketData({ symbol: sym, market: 'US', tf: 'D', provider: 'yahoo_free', mode });
      out.push({ symbol: sym, change_pct: safePct(d?.quote?.changePercent) });
    } catch (_) {
      out.push({ symbol: sym, change_pct: null });
    }
  }
  return out;
}

function applyCorrelationGuard({
  symbol,
  market,
  stockChange,
  marketBenchmark,
  refs,
  regime,
  trend_confirmed,
  confidence,
  trafficRaw,
  alerts,
  reasons,
  flags,
}) {
  const stockCh = safePct(stockChange);
  const benchCh = safePct(marketBenchmark?.change_pct);

  if (!Number.isFinite(stockCh) || !Number.isFinite(benchCh)) {
    return { confidence, flags };
  }

  // “Support” heuristic: any ref not crashing (>= -1) gives some sector/global support
  const hasSupportRef = (refs || []).some(r => Number.isFinite(Number(r.change_pct)) && Number(r.change_pct) >= -1);

  const hardMarketDrop = benchCh <= -3;
  const stockUpStrong = stockCh >= 2;
  const weakContext = (!trend_confirmed || regime === 'RANGE');

  // A08 — Global Context Conflict
  if (hardMarketDrop && stockUpStrong && weakContext) {
    flags.push('GLOBAL_CONTEXT_CONFLICT');

    alerts.push({
      code: 'A08',
      severity: 'MED',
      title_ar: 'تعارض مع السياق العام',
      message_ar: 'المؤشر العام يهبط بقوة بينما السهم يرتفع دون تأكيد ترند واضح — قد يكون رفعاً وهمياً وسط ضغط عام.',
      at: new Date().toISOString(),
    });

    reasons.push('تم خفض الثقة بسبب تناقض السياق العالمي.');
    reasons.push('المؤشر العام يهبط بقوة بينما السهم يرتفع.');
    reasons.push('لا يوجد تأكيد ترند واضح.');

    confidence = downgradeConfidence(confidence);
  }

  // Prevent strong GREEN during severe market drop with no support
  if (hardMarketDrop && (trafficRaw === 'GREEN') && (confidence === 'HIGH' || confidence === 'MED')) {
    if (!hasSupportRef) {
      flags.push('GLOBAL_CONTEXT_CONFLICT');
      reasons.push('لا يوجد دعم من المؤشرات المرجعية/القطاع لتبرير حكم آمن أثناء هبوط عام.');
      confidence = downgradeConfidence(confidence);
    }
  }

  return { confidence, flags };
}


const DEFAULT_SETTINGS = {
  // Alerts thresholds
  volumeTrap: { priceUpPct: 4, volRatioMax: 0.9 },
  overextended: { pctFromSma20: 15 },
  trendBreak: { requireAboveSma200: true },

  // Scoring weights (v1.8+) — dynamically rebalanced if a component is unavailable.
  weights: {
    technical: 0.30,
    fundamentals: 0.20,
    sentiment: 0.10,
    smf: 0.15,
    institutional: 0.15,
    earningsGrowth: 0.10,
  },

  // Decision profiles defaults
  riskProfile: 'balanced',
};

// -----------------------------
// v3.2 — Context + Dynamic Weights + Fusion + Confidence
// -----------------------------
function slopeSimple(series, lookback = 14) {
  const s = (series || []).map(Number).filter(Number.isFinite);
  if (s.length < Math.max(3, lookback)) return 0;
  const tail = s.slice(-lookback);
  const first = tail[0];
  const last = tail[tail.length - 1];
  const denom = Math.max(1, tail.length - 1);
  return (last - first) / denom; // per-candle slope
}

export function detectRegime({ price, ema20, sma50, ema20_series }) {
  const p = Number(price);
  const e20 = Number(ema20);
  const s50 = Number(sma50);
  const slope_ema20 = slopeSimple(ema20_series, 16);
  if ([p, e20, s50].every(Number.isFinite)) {
    if (e20 > s50 && slope_ema20 > 0 && p > e20) return 'UPTREND';
    if (e20 < s50 && slope_ema20 < 0 && p < e20) return 'DOWNTREND';
  }
  return 'RANGE';
}

export function trendConfirmation({ price, ema20, sma50, slope_ema20, macd_hist }) {
  const checks = [];
  const p = Number(price);
  const e20 = Number(ema20);
  const s50 = Number(sma50);
  if ([p, e20].every(Number.isFinite)) checks.push(p > e20);
  if ([e20, s50].every(Number.isFinite)) checks.push(e20 > s50);
  if (Number.isFinite(Number(slope_ema20))) checks.push(Number(slope_ema20) > 0);
  if (macd_hist != null && Number.isFinite(Number(macd_hist))) checks.push(Number(macd_hist) >= 0);
  // require 3 of 4 (if MACD unavailable, it simply won't add a check)
  const pass = checks.filter(Boolean).length >= 3;
  return pass;
}

function computeConfidence({ candlesLen, quote }) {
  const hasPrice = Number.isFinite(Number(quote?.price)) || Number.isFinite(Number(quote?.close));
  const hasVol = Number.isFinite(Number(quote?.volume));
  if (candlesLen >= 210 && hasPrice && hasVol) return 'HIGH';
  if (candlesLen >= 60 && hasPrice) return 'MED';
  return 'LOW';
}

function trafficWithLowConfidence(traffic, confidence) {
  if (confidence !== 'LOW') return traffic;
  // Do not output a strong red based on weak data: bias to YELLOW
  return traffic === 'RED' ? 'YELLOW' : traffic;
}

function fmt(x, suffix = ''){
  if (x === null || x === undefined || Number.isNaN(Number(x))) return '?';
  const n = Number(x);
  const v = Math.round(n * 10) / 10;
  return `${v}${suffix}`;

// === v3.3: Weekly aggregation + Relative Strength helpers ===
function aggregateToWeeklyOHLCV(daily = []) {
  const out = [];
  let cur = null;
  for (const c of (daily || [])) {
    const t = Number(c.t ?? c.time ?? c.timestamp ?? 0);
    const dt = new Date(t * 1000);
    const day = dt.getUTCDay();
    const diffToMon = (day === 0 ? 6 : day - 1);
    const mon = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    mon.setUTCDate(mon.getUTCDate() - diffToMon);
    const key = mon.toISOString().slice(0, 10);
    const o = Number(c.open ?? c.o);
    const h = Number(c.high ?? c.h);
    const l = Number(c.low ?? c.l);
    const cl = Number(c.close ?? c.c);
    const v = Number(c.volume ?? c.v ?? 0);
    if (!cur || cur.key !== key) {
      if (cur) out.push(cur.c);
      cur = { key, c: { t: Math.floor(mon.getTime()/1000), open: o, high: h, low: l, close: cl, volume: v } };
    } else {
      cur.c.high = Math.max(cur.c.high, h);
      cur.c.low = Math.min(cur.c.low, l);
      cur.c.close = cl;
      cur.c.volume += v;
    }
  }
  if (cur) out.push(cur.c);
  return out;
}

function pctChangeVal(a, b) {
  if (a == null || b == null || b === 0) return null;
  return ((a - b) / b) * 100;
}

function computeRelativeStrengthSimple(stockCloses = [], benchCloses = [], window = 63) {
  if (!stockCloses.length || !benchCloses.length) return { available: false };
  const sNow = stockCloses.at(-1);
  const bNow = benchCloses.at(-1);
  const sPast = stockCloses[Math.max(0, stockCloses.length - 1 - window)];
  const bPast = benchCloses[Math.max(0, benchCloses.length - 1 - window)];
  const sRet = pctChangeVal(sNow, sPast);
  const bRet = pctChangeVal(bNow, bPast);
  if (sRet == null || bRet == null) return { available: false };
  const rs = sRet - bRet;
  const label = rs >= 3 ? 'STRONG' : rs <= -3 ? 'WEAK' : 'NEUTRAL';
  return { available: true, window, stock_return_pct: sRet, benchmark_return_pct: bRet, rs_delta_pct: rs, label };
}
}

// Manager+Analyst: “حازم” (Explainable) — بدون توصية شراء/بيع
function buildAssistantOutput({ traffic, regime, trend_confirmed, confidence, features, alerts, clusters, global_context, settings, tf }) {
  const rsi = features?.rsi14;
  const dist = features?.dist_ema20_pct;
  const vol = features?.vol_ratio20;

  const sevRank = (s) => {
    const v = String(s || '').toUpperCase();
    if (v === 'HIGH') return 3;
    if (v === 'MED') return 2;
    if (v === 'LOW') return 1;
    return 0;
  };

  const silent = !!settings?.silent_mode;
  const minRank = sevRank(settings?.min_severity_to_show || 'MED');

  const rawAlerts = Array.isArray(alerts) ? alerts : [];
  const visibleAlerts = silent ? rawAlerts.filter(a => sevRank(a?.severity || a?.level || 'LOW') >= minRank) : rawAlerts;

  const hasC01 = (clusters || []).some(c => c.code === 'C01');
  const hasA09 = visibleAlerts.some(a => a.code === 'A09');
  const hasA08 = visibleAlerts.some(a => a.code === 'A08');
  const hasGapTrap = visibleAlerts.some(a => a.code === 'A07');
  const globalConflict = (global_context?.flags || []).includes('GLOBAL_CONTEXT_CONFLICT') || hasA08;

  // --- Executive Summary (one-liner) ---
  let executive_summary = '';
  if (hasA09) executive_summary = 'السهم في حالة تصريف خفي (Iceberg) مع امتصاص سيولة.';
  else if (traffic === 'RED' && hasC01) executive_summary = 'نمط تلاعب مركّب محتمل مع ارتفاع مستوى الخطر.';
  else if (traffic === 'RED') executive_summary = 'مستوى الخطر مرتفع ويستدعي تشديد الحذر.';
  else if (globalConflict) executive_summary = 'تعارض مع السوق العام يضعف الثقة في الحكم الحالي.';
  else if (traffic === 'YELLOW') executive_summary = 'حالة حذر: تحتاج تأكيد إضافي قبل الاعتماد على الإشارة.';
  else executive_summary = 'زخم مستقر نسبيًا ضمن سياق مقبول مع عدم وجود فخاخ عالية الشدة.';

  if (silent) {
    // shorten the tone when silent mode
    executive_summary = executive_summary.replace(' ويستدعي تشديد الحذر.', ' — شدّد الحذر.');
  }

  // --- Manager Actions (max 3, no buy/sell) ---
  const actions = [];
  const addAction = (a) => { if (a && !actions.includes(a) && actions.length < 3) actions.push(a); };

  if (traffic === 'RED') {
    addAction('ارفع الحذر');
    addAction('راقب السهم بدقة');
    addAction('انتظر تأكيد إضافي');
  } else if (traffic === 'YELLOW') {
    addAction('راقب السهم بدقة');
    addAction('انتظر تأكيد إضافي');
    addAction(globalConflict ? 'لا تعتمد على البيانات الحالية' : 'ارفع الحذر');
  } else {
    addAction('خفّض الحذر');
    addAction('راقب السهم بدقة');
    addAction('انتظر تأكيد إضافي');
  }

  // --- Why Now (3 explainable numeric/context reasons) ---
  const why_now = [];
  const pushWhy = (s) => { if (s && !why_now.includes(s) && why_now.length < 3) why_now.push(s); };

  if (Number.isFinite(rsi)) pushWhy(`RSI= ${Math.round(rsi)}`);
  if (Number.isFinite(dist)) pushWhy(`البعد عن EMA20 = ${Number(dist).toFixed(1)}%`);
  if (Number.isFinite(vol)) pushWhy(`نسبة الحجم = ×${Number(vol).toFixed(1)}`);

  const bmCh = global_context?.benchmark_change_pct;
  if (Number.isFinite(bmCh)) pushWhy(`المؤشر العام ${global_context?.benchmark || ''} = ${Number(bmCh).toFixed(1)}%`);

  // If still not enough, add regime/trend
  if (why_now.length < 3 && regime) pushWhy(`Regime= ${String(regime)}`);
  if (why_now.length < 3) pushWhy(`Trend Confirmed= ${trend_confirmed ? 'Yes' : 'No'}`);

  // --- Confidence Note ---
  const dm = String(settings?.data_mode || settings?.mode || '').toUpperCase();
  const isPro = dm === 'PRO';
  let confidence_note = '';

  if (String(confidence).toUpperCase() === 'LOW') {
    confidence_note = 'درجة الثقة منخفضة (بيانات متأخرة أو غير مكتملة).';
  } else if (isPro && (String(tf).toUpperCase() === '1M' || String(tf).toUpperCase() === '5M')) {
    confidence_note = 'درجة الثقة مرتفعة (بيانات محدثة Pro Intraday).';
  } else if (isPro) {
    confidence_note = 'درجة الثقة جيدة (بيانات Pro).';
  } else {
    confidence_note = `درجة الثقة: ${String(confidence).toUpperCase()} (وضع Free).`;
  }

  return {
    executive_summary,
    manager_actions: actions.slice(0, 3),
    why_now: why_now.slice(0, 3),
    confidence_note
  };
}


// -----------------------------
// v1.9 — Rules-based Decision Tag
// NOTE: This is NOT a buy/sell recommendation.
// -----------------------------
function computeDecision({ score, traffic, alerts, indicators, smf, institutionalFlow, earningsGrowth, riskProfile = 'balanced' }) {
  const why = [];
  const highAlerts = (alerts || []).filter(a => String(a.severity).toUpperCase() === 'HIGH');
  const hasHigh = highAlerts.length > 0;

  const rsi14 = Number(indicators?.rsi14);
  const above200 = Number.isFinite(Number(indicators?.price_to_sma200)) ? Number(indicators.price_to_sma200) >= 1 : null;

  const smfSig = String(smf?.signal || '').toUpperCase();
  const instDir = String(institutionalFlow?.direction || institutionalFlow?.signal || '').toUpperCase();
  const earnSig = String(earningsGrowth?.signal || '').toUpperCase();

  const rules = {
    conservative: { considerScore: 85, watchScore: 70, rsiMax: 68 },
    balanced: { considerScore: 80, watchScore: 60, rsiMax: 72 },
    aggressive: { considerScore: 75, watchScore: 55, rsiMax: 78 },
  }[riskProfile] || { considerScore: 80, watchScore: 60, rsiMax: 72 };

  // AVOID
  if (traffic === 'RED' || score < 45 || highAlerts.length >= 2) {
    if (traffic === 'RED') why.push('الحالة حمراء (مخاطر مرتفعة).');
    if (score < 45) why.push('درجة الثقة منخفضة جداً.');
    if (highAlerts.length >= 2) why.push('تنبيهات عالية متعددة.');
    return {
    marketRegime: detectMarketRegime({ closes: closes }), tag: 'AVOID', confidence: 'HIGH', why };
  }

  // REDUCE_RISK (for owners)
  if (hasHigh || (smfSig === 'DISTRIBUTION' && instDir === 'DISTRIBUTION') || earnSig === 'DECLINE') {
    if (hasHigh) why.push(`يوجد ${highAlerts.length} تنبيه عالي (HIGH).`);
    if (smfSig === 'DISTRIBUTION') why.push('SMF يشير إلى تصريف.');
    if (instDir === 'DISTRIBUTION') why.push('التدفق المؤسسي يشير إلى تصريف.');
    if (earnSig === 'DECLINE') why.push('اتجاه نمو الأرباح يتدهور.');
    return { tag: 'REDUCE_RISK', confidence: hasHigh ? 'HIGH' : 'MED', why };
  }

  // CONSIDER (entry bias)
  const hasAccum = smfSig === 'ACCUMULATION' || instDir === 'ACCUMULATION';
  const okTrend = above200 == null ? true : above200;
  const okRsi = Number.isFinite(rsi14) ? rsi14 <= rules.rsiMax : true;
  const okGrowth = earnSig ? earnSig !== 'DECLINE' : true;

  if (traffic === 'GREEN' && score >= rules.considerScore && hasAccum && okTrend && okRsi && okGrowth) {
    why.push('الحالة خضراء ودرجة ثقة مرتفعة.');
    if (hasAccum) why.push('إشارات تجميع (SMF/مؤسسي).');
    if (okTrend) why.push('الاتجاه الطويل داعم (فوق SMA200).');
    if (okRsi) why.push('الزخم غير متشبع شراء.');
    if (okGrowth) why.push('اتجاه النمو غير سلبي.');
    const conf = (score >= 88 && smfSig === 'ACCUMULATION' && instDir === 'ACCUMULATION') ? 'HIGH' : 'MED';
    return { tag: 'CONSIDER', confidence: conf, why };
  }

  // WATCH (default)
  if (score >= rules.watchScore) {
    if (traffic === 'YELLOW') why.push('الحالة بحذر — يلزم تأكيد إضافي.');
    else why.push('مستوى مخاطرة متوسط — متابعة.');
    if (!hasAccum) why.push('لا توجد إشارة تجميع قوية بعد.');
    return { tag: 'WATCH', confidence: 'LOW', why };
  }

  // fallback
  why.push('متابعة بحذر.');
  return { tag: 'WATCH', confidence: 'LOW', why };
}

// -----------------------------
// v2.0 — Opportunity & Exit Radar
// الهدف: إبراز "أفضلية الدخول" و"أفضلية الخروج/التخفيف" مع أسباب تفسيرية.
// -----------------------------
function computeOpportunityRadar({ traffic, score, indicators, fundamentals, alerts, smf, institutionalFlow, earningsGrowth, sectorValuation }) {
  const why = [];
  const highAlerts = (alerts || []).filter(a => String(a.severity).toUpperCase() === 'HIGH');
  const hasHigh = highAlerts.length > 0;

  // start from a baseline that favors low-risk
  let opp = 50;

  // 1) Structure & Trend
  const above200 = Number.isFinite(Number(indicators?.price_to_sma200)) ? Number(indicators.price_to_sma200) : null;
  if (above200 != null) {
    if (above200 >= 1) { opp += 12; why.push('اتجاه طويل داعم (فوق SMA200).'); }
    else { opp -= 12; why.push('اتجاه طويل ضعيف (تحت SMA200).'); }
  }

  // 2) Smart money / Institutional
  const smfSig = String(smf?.signal || '').toUpperCase();
  const instDir = String(institutionalFlow?.direction || institutionalFlow?.signal || '').toUpperCase();
  if (smfSig === 'ACCUMULATION') { opp += 10; why.push('SMF يشير إلى تجميع.'); }
  if (instDir === 'ACCUMULATION') { opp += 8; why.push('التدفق المؤسسي يميل للتجميع.'); }
  if (smfSig === 'DISTRIBUTION') { opp -= 12; why.push('SMF يشير إلى تصريف.'); }
  if (instDir === 'DISTRIBUTION') { opp -= 10; why.push('التدفق المؤسسي يشير إلى تصريف.'); }

  // 3) Earnings growth
  const earnSig = String(earningsGrowth?.signal || '').toUpperCase();
  if (earnSig === 'IMPROVING') { opp += 10; why.push('اتجاه نمو الأرباح يتحسن.'); }
  else if (earnSig === 'DECLINE') { opp -= 10; why.push('اتجاه نمو الأرباح يتدهور.'); }

  // 4) Fundamentals (simple conservative gates)
  const pe = Number(fundamentals?.pe);
  const de = Number(fundamentals?.debt_equity);
  const roe = Number(fundamentals?.roe);
  const opm = Number(fundamentals?.operating_margin);

  if (Number.isFinite(roe)) {
    if (roe >= 10) { opp += 6; why.push('عائد على حقوق الملكية (ROE) جيد.'); }
    else if (roe < 0) { opp -= 8; why.push('ROE سلبي.'); }
  }
  if (Number.isFinite(opm)) {
    if (opm >= 5) { opp += 5; why.push('هامش تشغيلي إيجابي.'); }
    else if (opm < 0) { opp -= 6; why.push('هامش تشغيلي سلبي.'); }
  }
  if (Number.isFinite(de)) {
    if (de <= 1) { opp += 4; }
    else if (de > 2) { opp -= 6; why.push('مديونية مرتفعة (Debt/Equity).'); }
  }
  if (Number.isFinite(pe)) {
    // if sector valuation is available, use it
    const val = String(sectorValuation?.valuation || '').toUpperCase();
    if (val === 'UNDERVALUED') { opp += 6; why.push('التقييم أقل من متوسط القطاع (مغري نسبياً).'); }
    else if (val === 'OVERVALUED') { opp -= 6; why.push('التقييم أعلى من متوسط القطاع (مبالغ).'); }
    else {
      if (pe <= 25) opp += 2;
      if (pe > 40) { opp -= 5; why.push('مكرر ربحية مرتفع جداً.'); }
    }
  }

  // 5) Risk penalties
  if (traffic === 'GREEN') opp += 6;
  if (traffic === 'YELLOW') opp -= 2;
  if (traffic === 'RED') { opp -= 18; why.push('الحالة حمراء.'); }

  if (hasHigh) { opp -= Math.min(18, highAlerts.length * 8); why.push(`تنبيهات عالية (${highAlerts.length}).`); }

  // Use trust score as a stabilizer
  if (Number.isFinite(Number(score))) opp += (Number(score) - 60) * 0.15; // gentle

  opp = clamp(Math.round(opp), 0, 100);

  let tag = 'MID_OPPORTUNITY';
  if (opp >= 80 && traffic !== 'RED' && !hasHigh) tag = 'HIGH_OPPORTUNITY';
  else if (opp < 50) tag = 'LOW_OPPORTUNITY';

  // keep only top 5 reasons
  return { score: opp, tag, why: why.slice(0, 5) };
}

function computeExitRadar({ indicators, alerts, smf, institutionalFlow, earningsGrowth }) {
  const why = [];
  const highAlerts = (alerts || []).filter(a => String(a.severity).toUpperCase() === 'HIGH');

  let ex = 30;

  // Distribution signals
  const smfSig = String(smf?.signal || '').toUpperCase();
  const instDir = String(institutionalFlow?.direction || institutionalFlow?.signal || '').toUpperCase();
  if (smfSig === 'DISTRIBUTION') { ex += 18; why.push('SMF يشير إلى تصريف.'); }
  if (instDir === 'DISTRIBUTION') { ex += 14; why.push('تدفق مؤسسي يميل للتصريف.'); }
  if (smfSig === 'ACCUMULATION') ex -= 6;
  if (instDir === 'ACCUMULATION') ex -= 5;

  // Overextended / structure
  const to20 = Number(indicators?.price_to_sma20);
  if (Number.isFinite(to20) && to20 > 1.15) { ex += 12; why.push('تمدد سعري فوق SMA20 (Overextended).'); }

  const above200 = Number(indicators?.price_to_sma200);
  if (Number.isFinite(above200) && above200 < 1) { ex += 10; why.push('تحت SMA200 (ضعف اتجاه).'); }

  // Earnings growth deterioration
  const earnSig = String(earningsGrowth?.signal || '').toUpperCase();
  if (earnSig === 'DECLINE') { ex += 12; why.push('اتجاه نمو الأرباح يتدهور.'); }

  // Alerts
  if (highAlerts.length) { ex += Math.min(28, highAlerts.length * 10); why.push(`تنبيهات عالية (${highAlerts.length}).`); }

  ex = clamp(Math.round(ex), 0, 100);
  let tag = 'MID_EXIT_RISK';
  if (ex >= 70) tag = 'HIGH_EXIT_RISK';
  else if (ex <= 35) tag = 'LOW_EXIT_RISK';

  return { score: ex, tag, why: why.slice(0, 5) };
}


function trafficFromScore(score) {
  if (score >= 80) return 'GREEN';
  if (score >= 50) return 'YELLOW';
  return 'RED';
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function pct(a, b) {
  if (!b || b === 0) return 0;
  return ((a - b) / b) * 100;
}

function clamp01(n) {
  return clamp(n, -1, 1);
}

// --- Earnings Growth Trend (Quarterly) — v1.8 ---
// الهدف: مؤشر أساسي قوي (أقوى من MACD في سياق تقييم المخاطر) يعتمد على اتجاه نمو الإيرادات/الأرباح.
function calculateEarningsGrowthTrend(quarterlyPack) {
  try {
    const q = quarterlyPack?.quarterly;
    if (!Array.isArray(q) || q.length < 5) return { available: false };
    const rows = [...q]
      .filter((x) => x?.endDate)
      .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));
    if (rows.length < 5) return { available: false };

    const last = rows[rows.length - 1];
    const prev4 = rows[rows.length - 5];

    const revNow = Number(last.revenue);
    const revPrev = Number(prev4.revenue);
    const niNow = Number(last.netIncome);
    const niPrev = Number(prev4.netIncome);

    let revYoY = null;
    if (Number.isFinite(revNow) && Number.isFinite(revPrev) && revPrev !== 0) revYoY = ((revNow - revPrev) / Math.abs(revPrev)) * 100;
    let niYoY = null;
    if (Number.isFinite(niNow) && Number.isFinite(niPrev) && niPrev !== 0) niYoY = ((niNow - niPrev) / Math.abs(niPrev)) * 100;

    // EPS YoY (اختياري)
    const eps = quarterlyPack?.epsQuarterly;
    let epsYoY = null;
    if (Array.isArray(eps) && eps.length >= 5) {
      const e = eps.filter((x) => x?.date).slice(-5);
      const eNow = Number(e[e.length - 1]?.actual);
      const ePrev = Number(e[0]?.actual);
      if (Number.isFinite(eNow) && Number.isFinite(ePrev) && ePrev !== 0) epsYoY = ((eNow - ePrev) / Math.abs(ePrev)) * 100;
    }

    // Score mapping (0..100) — conservative
    let score = 50;
    if (revYoY != null) score += clamp(revYoY / 4, -20, 20);
    if (niYoY != null) score += clamp(niYoY / 5, -25, 25);
    if (epsYoY != null) score += clamp(epsYoY / 6, -15, 15);

    const opm = Number(quarterlyPack?.operating_margin);
    if (Number.isFinite(opm)) score += opm >= 15 ? 6 : opm <= 0 ? -10 : -2;

    score = clamp(score, 0, 100);
    const signal = score >= 65 ? 'GROWTH' : score <= 40 ? 'DECLINE' : 'MIXED';

    return {
      available: true,
      score: Math.round(score),
      signal,
      revenue_yoy: revYoY != null ? Number(revYoY.toFixed(1)) : null,
      net_income_yoy: niYoY != null ? Number(niYoY.toFixed(1)) : null,
      eps_yoy: epsYoY != null ? Number(epsYoY.toFixed(1)) : null,
    };
  } catch (_) {
    return { available: false };
  }
}

// --- Institutional Flow — v1.8 (improved) ---
function calculateInstitutionalFlow({ price, indicators, smf, volumeAnomaly, intraday }) {
  try {
    if (!smf?.available && !Array.isArray(intraday)) return { available: false };

    // Intraday VWAP + delta-volume proxy
    let vwap = null;
    let delta = null;
    if (Array.isArray(intraday) && intraday.length >= 20) {
      let pv = 0;
      let vv = 0;
      let d = 0;
      for (let i = 1; i < intraday.length; i++) {
        const p0 = Number(intraday[i - 1]?.close);
        const p1 = Number(intraday[i]?.close);
        const vol = Number(intraday[i]?.volume);
        if (!Number.isFinite(p1) || !Number.isFinite(vol)) continue;
        pv += p1 * vol;
        vv += vol;
        if (Number.isFinite(p0)) d += (p1 >= p0 ? 1 : -1) * vol;
      }
      vwap = vv > 0 ? (pv / vv) : null;
      delta = vv > 0 ? (d / vv) : null; // تقريباً -1..+1
    }

    let score = 50;
    const above200 = indicators?.sma200 != null ? (price >= Number(indicators.sma200)) : null;
    if (above200 === true) score += 8;
    if (above200 === false) score -= 8;

    if (smf?.available) {
      if (smf.signal === 'ACCUMULATION') score += 14;
      if (smf.signal === 'DISTRIBUTION') score -= 18;
      if (smf.type === 'PRO') score += 4;
    }

    if (vwap != null && Number.isFinite(vwap)) {
      const edge = (price - vwap) / vwap;
      if (edge >= 0.004) score += 6;
      if (edge <= -0.004) score -= 6;
      if (delta != null) score += clamp(delta * 10, -8, 8);
    }

    if (volumeAnomaly?.available && volumeAnomaly.flag === 'SPIKE') {
      if (smf?.signal === 'DISTRIBUTION') score -= 10;
      else score += 2;
    }

    score = clamp(score, 0, 100);
    const signal = score >= 60 ? 'ACCUMULATION' : score <= 45 ? 'DISTRIBUTION' : (smf?.signal || 'MIXED');
    const confidence = (Array.isArray(intraday) && intraday.length >= 20) ? 'HIGH' : (smf?.type === 'PRO' ? 'HIGH' : (smf?.available ? 'MED' : 'LOW'));
    return {
      available: true,
      score: Math.round(score),
      signal,
      confidence,
    assistant,
    smart_money,
      vwap: vwap != null ? Number(vwap.toFixed(4)) : null,
      delta: delta != null ? Number(delta.toFixed(3)) : null,
    };
  } catch (_) {
    return { available: false };
  }
}

// --- Smart Money Flow (SMF) ---
// Lite: CMF approximation using Close Location Value (CLV)
// CMF = sum( CLV * volume ) / sum(volume)
function calculateSMFLite(candles, lookback = 20) {
  const src = (candles || []).slice(-lookback);
  if (src.length < Math.max(10, Math.floor(lookback * 0.6))) {
    return { available: false };
  }

  let mfSum = 0;
  let volSum = 0;
  for (const c of src) {
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    const vol = Number(c.volume);
    if (![high, low, close, vol].every(Number.isFinite)) continue;
    const range = high - low;
    const clv = range === 0 ? 0 : (((close - low) - (high - close)) / range); // -1..+1
    mfSum += clv * vol;
    volSum += vol;
  }

  if (volSum <= 0) return { available: false };
  const cmf = clamp01(mfSum / volSum);
  
  // v3.5.0: Low Confidence Shield — avoid harsh judgments on stale/weak data
  if (confidence === 'LOW') {
    // Downgrade A01 HIGH -> MED (or OFF if you prefer) to avoid false alarms on delayed feeds
    for (const a of alerts) {
      if (a.code === 'A01' && String(a.severity || a.level).toUpperCase() === 'HIGH') {
        a.level = 'MED';
        a.severity = 'MED';
        a.message = (a.message || '') + ' (تم خفض الشدة بسبب ضعف/تأخر البيانات)';
      }
    }
  }


  // ---------------------
  // v3.7.0 Gap Logic → A07 + Trap Upgrade
  // ---------------------
  if (gap_type === 'GAP_EXHAUSTION_TRAP') {
    alerts.push({
      code: 'A07',
      severity: 'HIGH',
      title: 'فجوة إنهاك/تصريف',
      reasons_ar: [
        'فجوة صاعدة كبيرة + إغلاق ضعيف',
        `بعيد عن EMA20 بنسبة ${Number(dist_ema20_pct || 0).toFixed(1)}%`,
        `الحجم أعلى من المتوسط ${Number(vol_ratio20 || 0).toFixed(1)}x`
      ]
    });

    for (const a of alerts) {
      if (a.code === 'A01' || a.code === 'A03') {
        a.severity = 'HIGH';
      }
    }
  }

  if (gap_type === 'GAP_BREAKAWAY') {
    for (const a of alerts) {
      if (a.code === 'A01' && trend_confirmed === true && close_position >= 0.7) {
        a.severity = 'MED';
      }
    }
  }

const score = Math.round(clamp(50 + cmf * 50, 0, 100));
  const signal = cmf >= 0.05 ? 'ACCUMULATION' : cmf <= -0.05 ? 'DISTRIBUTION' : 'ACCUMULATION';
  return { available: true, type: 'LITE', score, signal, raw: { cmf: Number(cmf.toFixed(4)) } };
}

// Pro: requires intraday data. We detect flow in first/last 30 minutes.
// intradayData: [{t, open, close, volume}]
function calculateSMFPro(intradayData) {
  const arr = (intradayData || []).map((x) => ({
    t: x.t,
    open: Number(x.open),
    close: Number(x.close),
    volume: Number(x.volume),
  })).filter((x) => Number.isFinite(x.open) && Number.isFinite(x.close) && Number.isFinite(x.volume));

  if (arr.length < 20) return { available: false };

  // Assume sorted by time.
  const first = arr.slice(0, Math.min(arr.length, 30));
  const last = arr.slice(Math.max(0, arr.length - 30));

  const flow = (slice) => slice.reduce((acc, c) => {
    const dir = c.close >= c.open ? 1 : -1;
    return acc + dir * c.volume;
  }, 0);

  const f = flow(first);
  const l = flow(last);
  const total = Math.abs(f) + Math.abs(l);
  if (total === 0) return { available: false };
  const raw = clamp01((l - f) / total); // -1..+1
  const score = Math.round(clamp(50 + raw * 50, 0, 100));
  const signal = raw >= 0.1 ? 'ACCUMULATION' : raw <= -0.1 ? 'DISTRIBUTION' : 'ACCUMULATION';
  return { available: true, type: 'PRO', score, signal, raw: { pro: Number(raw.toFixed(4)) } };
}

function zScore(value, mean, std) {
  if (!Number.isFinite(value) || !Number.isFinite(mean) || !Number.isFinite(std) || std === 0) return 0;
  return (value - mean) / std;
}

function detectBearishDivergence(closes, rsi14) {
  // Very lightweight divergence: compare last two swing highs in price and RSI
  // Returns { found:boolean, idx:number|null } where idx is the 2nd (new) price peak index
  const findPeaks = (arr) => {
    const peaks = [];
    for (let i = 3; i < arr.length - 3; i++) {
      const v = arr[i];
      if (v > arr[i - 1] && v > arr[i - 2] && v > arr[i - 3] && v > arr[i + 1] && v > arr[i + 2] && v > arr[i + 3]) {
        peaks.push({ i, v });
      }
    }
    return peaks;
  };

  const pPeaks = findPeaks(closes);
  const rPeaks = findPeaks(rsi14);
  if (pPeaks.length < 2 || rPeaks.length < 2) return { found: false, idx: null };

  const p2 = pPeaks[pPeaks.length - 1];
  const p1 = pPeaks[pPeaks.length - 2];

  const nearest = (peaks, idx) => peaks.reduce((best, cur) => (Math.abs(cur.i - idx) < Math.abs(best.i - idx) ? cur : best), peaks[0]);
  const r1 = nearest(rPeaks, p1.i);
  const r2 = nearest(rPeaks, p2.i);

  const found = p2.v > p1.v && r2.v < r1.v;
  return { found, idx: found ? p2.i : null };
}

export async function analyzeSymbol({ symbol, market, tf = 'D', settings = DEFAULT_SETTINGS, sentimentInput = null }) {
  // v1.9: merge partial settings safely
  const mergedSettings = {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    weights: {
      ...(DEFAULT_SETTINGS.weights || {}),
      ...(((settings || {}).weights) || {}),
    },
  };
  const data = await getMarketData({ symbol, market, tf, provider: settings?.provider, mode: settings?.data_mode });

  // v3.4.3: sentiment input (manual/provider) — stable/legal (no scraping)
  const sentiment = (sentimentInput && sentimentInput.ok !== false) ? {
    hype_score: Number.isFinite(Number(sentimentInput.hype_score)) ? Number(sentimentInput.hype_score) : null,
    news_severity: Number.isFinite(Number(sentimentInput.news_severity)) ? Number(sentimentInput.news_severity) : null,
    updated_at: sentimentInput.updated_at || null,
    source: sentimentInput.source || null,
    sources: sentimentInput.sources || []
  } : { hype_score: null, news_severity: null, updated_at: null, source: null, sources: [] };

  // v3.5.0: Data Integrity Engine (meta.data_quality)
  const provider_used = data?.provider || data?.data_source || null;
  const effectiveMode = (data?.mode === 'pro') ? 'pro' : 'free';
  const data_quality = computeDataQuality({ data, market, tf, provider_used, effectiveMode });
  // v3.3: benchmark fetch (Relative Strength) + optional sector benchmark
  const benchmarkSymbol = (market === 'SA') ? '^TASI' : '^GSPC';
  const sectorBenchmarkSymbol = mergedSettings?.sectorSymbol || null; // optional override
  let benchData = { candles: [] };
  let sectorData = { candles: [] };
  try { benchData = await getMarketData({ symbol: benchmarkSymbol, market, tf, provider: settings?.provider, mode: settings?.data_mode }); } catch (e) {}
  if (sectorBenchmarkSymbol) {
    try { sectorData = await getMarketData({ symbol: sectorBenchmarkSymbol, market, tf, provider: settings?.provider, mode: settings?.data_mode }); } catch (e) {}
  }

  // If provider failed, fall back to "synthetic" values
    // v3.3: weekly normalize
  let candles = data.candles;
  let benchCandles = benchData?.candles || [];
  let sectorCandles = sectorData?.candles || [];
  if (tf === 'W') {
    candles = aggregateToWeeklyOHLCV(candles || []);
    benchCandles = aggregateToWeeklyOHLCV(benchCandles || []);
    sectorCandles = aggregateToWeeklyOHLCV(sectorCandles || []);
  }
  const quote = data.quote;

  // Liquidity Rules (no AI) — safe addon
  let liquidity = null;
  try {
    liquidity = analyzeLiquidity({ candles: (candles || []) });
  } catch (_) {
    liquidity = null;
  }

  const closes = candles?.map((c) => Number(c.close)).filter(Number.isFinite) ?? [];
  const highs = candles?.map((c) => Number(c.high)).filter(Number.isFinite) ?? [];
  const lows = candles?.map((c) => Number(c.low)).filter(Number.isFinite) ?? [];
  const volumes = candles?.map((c) => Number(c.volume)).filter(Number.isFinite) ?? [];

  // Minimum history for core indicators
  const hasHistory = closes.length >= 210 && volumes.length >= 210;

  let indicators = {
    rsi14: null,
    sma20: null,
    sma50: null,
    sma200: null,
    ema20: null,
    atr14: null,
    bb_upper: null,
    bb_lower: null,
    macd: null,
    macd_signal: null,
    macd_hist: null,
    vol_ratio20: null,
  };

  let latest = {
    price: quote?.price ?? null,
    change_percent: quote?.change_percent ?? null,
    volume: quote?.volume ?? null,
    currency: quote?.currency ?? null,
  };

  // Compute indicators
  let rsiSeries = [];
  let ema20Series = [];
  if (hasHistory) {
    rsiSeries = rsi(closes, 14);
    const rsi14 = rsiSeries[rsiSeries.length - 1];
    const sma20v = sma(closes, 20).at(-1);
    const sma50v = sma(closes, 50).at(-1);
    const sma200v = sma(closes, 200).at(-1);
    ema20Series = ema(closes, 20);
    const ema20v = ema20Series.at(-1);
    const atr14v = atr(highs, lows, closes, 14).at(-1);
    const bb = bollinger(closes, 20, 2);
    const bbU = bb.upper.at(-1);
    const bbL = bb.lower.at(-1);
    const m = macd(closes, 12, 26, 9);

    const vol20 = volumes.slice(-21, -1);
    const avgVol20 = vol20.reduce((a, b) => a + b, 0) / Math.max(1, vol20.length);
    const curVol = volumes.at(-1);
    const volRatio20 = avgVol20 > 0 ? curVol / avgVol20 : null;

    indicators = {
      rsi14: rsi14,
      sma20: sma20v,
      sma50: sma50v,
      sma200: sma200v,
      ema20: ema20v,
      atr14: atr14v,
      bb_upper: bbU,
      bb_lower: bbL,
      macd: m.macd.at(-1),
      macd_signal: m.signal.at(-1),
      macd_hist: m.hist.at(-1),
      vol_ratio20: volRatio20,
    };

    // If quote not provided, infer from candles
    if (latest.price == null) latest.price = closes.at(-1);
    if (latest.volume == null) latest.volume = curVol;
    if (latest.change_percent == null) {
      const prev = closes.at(-2);
      latest.change_percent = prev ? (pct(closes.at(-1), prev) / 100) : 0;
    }
  } else {
    // Synthetic fallback (still usable with Demo Mode)
    const price = Number(latest.price ?? 100);
    indicators.rsi14 = 55;
    indicators.sma20 = price * 0.98;
    indicators.sma50 = price * 0.95;
    indicators.sma200 = price * 0.9;
    indicators.vol_ratio20 = 1;

  // v3.3: Relative Strength (stock vs market benchmark) + Sector Guard
  const rs_window = (tf === 'W') ? 26 : 63; // ~6 أشهر
  const relativeStrength = computeRelativeStrengthSimple(closes, benchCloses, rs_window);
  const sectorStrength = computeRelativeStrengthSimple(closes, sectorCloses, rs_window);
  }

  
  // ---------------------
  // v3.2 Context Awareness
  // ---------------------
  const ema20v_num = Number(indicators.ema20);
  const sma50v_num = Number(indicators.sma50);
  const slope_ema20 = slopeSimple(ema20Series, 16);
  const regime = detectRegime({ price: latest.price ?? closes.at(-1), ema20: ema20v_num, sma50: sma50v_num, ema20_series: ema20Series });
  const trend_confirmed = trendConfirmation({ price: latest.price ?? closes.at(-1), ema20: ema20v_num, sma50: sma50v_num, slope_ema20, macd_hist: indicators.macd_hist });

  // Gap proxy (news/event days): compare last open vs prev close
  const prevClose = Number(closes.at(-2));
  const lastOpen = Number(candles?.at(-1)?.open);
  const gap_pct_open_prevclose = (Number.isFinite(lastOpen) && Number.isFinite(prevClose) && prevClose !== 0)
    ? ((lastOpen - prevClose) / prevClose) * 100
    : 0;

  const dist_ema20_pct = (Number.isFinite(ema20v_num) && ema20v_num !== 0 && Number.isFinite(Number(latest.price)))
    ? ((Number(latest.price) - ema20v_num) / ema20v_num) * 100
    : null;

  // ---------------------
  // v3.7.0 Gap & Exhaustion Features
  // ---------------------
  const prevCloseGap = closes?.length >= 2 ? closes[closes.length - 2] : null;
  const openToday = Number(latest.open ?? latest.price);
  const highToday = Number(latest.high ?? latest.price);
  const lowToday = Number(latest.low ?? latest.price);
  const closeToday = Number(latest.price);

  const gap_pct = (Number.isFinite(openToday) && Number.isFinite(prevCloseGap) && prevCloseGap !== 0)
    ? ((openToday - prevCloseGap) / prevCloseGap) * 100
    : 0;

  const range_atr = (Number.isFinite(highToday) && Number.isFinite(lowToday) && Number.isFinite(atr14) && atr14 !== 0)
    ? ((highToday - lowToday) / atr14)
    : null;

  const close_position = (Number.isFinite(highToday) && Number.isFinite(lowToday) && (highToday - lowToday) !== 0)
    ? ((closeToday - lowToday) / (highToday - lowToday))
    : null;

  function classifyGap({ gap_pct, dist_ema20_pct, range_atr, close_position, vol_ratio20, regime, trend_confirmed }) {
    if (gap_pct >= 2.5 &&
        close_position >= 0.70 &&
        vol_ratio20 >= 1.8 &&
        (regime === 'UPTREND' || trend_confirmed === true)) {
      return 'GAP_BREAKAWAY';
    }

    if (gap_pct >= 3.0 &&
        dist_ema20_pct >= 8 &&
        (close_position <= 0.35 || range_atr >= 2.2) &&
        vol_ratio20 >= 2.2) {
      return 'GAP_EXHAUSTION_TRAP';
    }

    return null;
  }

  const gap_type = classifyGap({
    gap_pct,
    dist_ema20_pct,
    range_atr,
    close_position,
    vol_ratio20,
    regime,
    trend_confirmed
  });

  let confidence = computeConfidence({ candlesLen: closes.length, quote });

  // v3.5.0: Freshness-aware confidence + integrity flags
  if (data_quality) {
    const lag = data_quality.lag_minutes;
    const isFree = !!data_quality.is_free_mode;
    const isPro = !isFree;

    // Cap/downgrade confidence based on lag
    if (isFree) {
      if (Number.isFinite(lag) && lag > 60) confidence = 'LOW';
      else if (Number.isFinite(lag) && lag > 15 && confidence === 'HIGH') confidence = 'MED';
      else if (Number.isFinite(lag) && lag > 15 && confidence === 'MED') confidence = 'MED';
    } else {
      if (Number.isFinite(lag) && lag > 5) confidence = downgradeConfidence(confidence);
    }

    if (Number.isFinite(lag) && ((isFree && lag > 15) || (isPro && lag > 5))) {
      data_quality.integrity_flags.push('DATA_STALE');
    }

    const miss = data_quality.missing_days_ratio;
    if (Number.isFinite(miss) && miss >= 0.35) {
      data_quality.integrity_flags.push('DATA_GAPS');
      confidence = downgradeConfidence(confidence);
    }
  }


  // v3.5.0: Validation — Free vs Pro (نزاهة البيانات)
  try {
    const hasProKey = !!String(process.env.FINNHUB_KEY || process.env.FINNHUB_API_KEY || process.env.EODHD_KEY || process.env.EOD_HISTORICAL_DATA_KEY || '').trim();
    if (data?.mode === 'pro' && hasProKey) {
      const freeData = await getMarketData({ symbol, market, tf, provider: 'yahoo_free', mode: 'free' });
      const proClose = (data?.candles?.length ? data.candles[data.candles.length - 1].close : null);
      const freeClose = (freeData?.candles?.length ? freeData.candles[freeData.candles.length - 1].close : null);
      if (Number.isFinite(Number(proClose)) && Number.isFinite(Number(freeClose)) && Number(proClose) !== 0) {
        const close_delta_pct = Math.abs(Number(proClose) - Number(freeClose)) / Math.abs(Number(proClose)) * 100;
        if (close_delta_pct >= Number(process.env.DATA_MISMATCH_THRESHOLD_PCT || 0.8)) {
          data_quality.integrity_flags.push('DATA_MISMATCH_FREE_PRO');
          data_quality.close_delta_pct = Number(close_delta_pct.toFixed(2));
          confidence = downgradeConfidence(confidence);
        }
      }
    }
  } catch (_) {}


// ---------------------
  // Alerts + Explainability buckets (v1.4)
  // ---------------------
  const alerts = [];
  const reasonsByAxis = { technical: [], fundamentals: [], sentiment: [], alerts: [] };
  const reasons = []; // flat list for backward compatibility

  // ---------------------
  // Cross-Market Validation (A08) — Global Context / Correlation Guard
  // ---------------------
  const globalFlags = [];
  let global_context = null;

  try {
    const bm = await getBenchmarksContext({ market, mode: settings?.data_mode || settings?.dataMode || data?.mode || 'free' });
    const refs = await getRefsChanges({ symbol, market, mode: settings?.data_mode || settings?.dataMode || data?.mode || 'free' });

    const primaryBench = bm?.primary || null;
    global_context = {
      benchmark: primaryBench?.symbol || (String(market || '').toUpperCase() === 'SA' ? '^TASI' : '^GSPC'),
      benchmark_change_pct: primaryBench?.change_pct ?? null,
      refs: refs.map(x => ({ symbol: x.symbol, change_pct: x.change_pct })),
      flags: [],
    };
  } catch (_) {
    // silent
  }

  // Normalize change % as a "percent number" (e.g., 1.25 means +1.25%)
  const rawCh = Number(latest.change_percent ?? 0);
  const priceChangePct = Math.abs(rawCh) <= 1 ? rawCh * 100 : rawCh;
  const vratio = Number(indicators.vol_ratio20 ?? 1);
  const price = Number(latest.price ?? 0);

  // ---------------------
  // v1.6: Smart Money Flow + Institutional + Sector + Earnings Quality + Volume Anomaly
  // ---------------------
  const smfPro = data.intraday?.length ? calculateSMFPro(data.intraday) : { available: false };
  const smfLite = calculateSMFLite(candles, 20);
  const smf = smfPro.available ? smfPro : (smfLite.available ? smfLite : { available: false });

  // Volume anomaly (z-score on last 60 days)
  let volumeAnomaly = { available: false };
  if (volumes.length >= 80) {
    const window = volumes.slice(-61, -1);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length;
    const std = Math.sqrt(variance);
    const cur = volumes.at(-1);
    const z = zScore(cur, mean, std);
    const score = Math.round(clamp(50 + z * 10, 0, 100));
    const flag = z >= 2.5 ? 'SPIKE' : z <= -2.0 ? 'DRY' : 'NORMAL';
    volumeAnomaly = { available: true, z: Number(z.toFixed(2)), score, flag };
  }
  // v3.3: Sector Guard alert (اختياري)
  if (sectorStrength && sectorStrength.available) {
    const sectorDelta = Number(sectorStrength.rs_delta_pct || 0);
    const sectorRet = Number(sectorStrength.benchmark_return_pct || 0);
    const volSpike = (volumeAnomaly?.flag === 'SPIKE') || (vratio >= 2);
    const hot = (dist_ema20_pct != null && Number(dist_ema20_pct) >= 10) || (Number(indicators.rsi14 || 0) >= 75);
    if (sectorRet <= -3 && sectorDelta >= 6 && (volSpike || hot) && !trend_confirmed) {
      alerts.push({
        code: 'A06',
        severity: 'MED',
        title_ar: 'حارس القطاع: صعود شاذ مقابل ضعف القطاع',
        message_ar: 'السهم يتفوق بقوة على قطاعه بينما القطاع ضعيف. تحقق من سبب الصعود وتجنب الضجيج.'
      });
    }
  }


  // Sector-relative valuation (MVP): use generic benchmark unless a sector benchmark is provided
  const sector = data.sector || null;
  const sectorBenchPE = Number(data.sectorBenchmarks?.pe ?? 18);
  let sectorValuation = { available: false };
  const peNum = Number(data.fundamentals?.pe);
  if (Number.isFinite(peNum) && peNum > 0) {
    const ratio = peNum / sectorBenchPE;
    const valuation = ratio >= 1.5 ? 'OVERVALUED' : ratio <= 0.7 ? 'UNDERVALUED' : 'FAIR';
    sectorValuation = {
      available: true,
      sector: sector || 'GENERAL',
      sectorPE: sectorBenchPE,
      stockPE: peNum,
      valuation,
      ratio: Number(ratio.toFixed(2)),
    };
  }

  // Earnings quality (MVP proxy): if we have profitability + leverage signals, build a conservative score.
  let earningsQuality = { available: false };
  const roeNum = Number(data.fundamentals?.roe);
  const opmNum = Number(data.fundamentals?.operating_margin);
  const deNum = Number(data.fundamentals?.debt_equity);
  if ([roeNum, opmNum].some(Number.isFinite)) {
    let qScore = 50;
    if (Number.isFinite(opmNum)) qScore += opmNum >= 10 ? 10 : opmNum <= 0 ? -12 : -4;
    if (Number.isFinite(roeNum)) qScore += roeNum >= 15 ? 10 : roeNum <= 0 ? -12 : -4;
    if (Number.isFinite(deNum)) qScore += deNum <= 1 ? 6 : deNum >= 2 ? -8 : -2;
    qScore = clamp(qScore, 0, 100);
    const flag = qScore >= 65 ? 'STRONG' : qScore <= 40 ? 'WEAK' : 'MIXED';
    earningsQuality = { available: true, qualityScore: Math.round(qScore), flag, note: 'تقدير محافظ (Proxy) لعدم توفر Cashflow في v1.6.' };
  }

  // v1.8: Institutional Flow (Improved) + Earnings Growth Trend
  const institutionalFlow = calculateInstitutionalFlow({
    price,
    indicators,
    smf,
    volumeAnomaly,
    intraday: data.intraday,
  });

  const earningsGrowth = calculateEarningsGrowthTrend(data.quarterly);

  // A01: Trap vs Momentum (v3.2)
  // Old: price up + low volume -> trap (too many false positives)
  // New: require multiple "overheated" conditions + lack of trend confirmation.
  const a01_base = [
    Math.abs(priceChangePct) >= Number(mergedSettings.volumeTrap.priceUpPct || 4),
    Number(indicators.rsi14) >= 72,
    dist_ema20_pct != null ? Math.abs(Number(dist_ema20_pct)) >= 8 : false,
    (Number.isFinite(vratio) && vratio >= 2.5) || (volumeAnomaly?.flag === 'SPIKE'),
  ].filter(Boolean).length >= 3;

  const isUptrendConfirmed = (regime === 'UPTREND' && trend_confirmed === true);
  const momentumProxy = (Math.abs(gap_pct) >= 2.5) && (Number.isFinite(Number(latest.price)) && Number.isFinite(Number(candles?.at(-1)?.high)))
    ? (Number(latest.price) >= Number(candles.at(-1).high) * 0.97) : false; // close near high

  // If strong trend confirmed and momentum event looks "healthy", do not fire A01 (or downgrade to note)
  if (a01_base) {
    if (isUptrendConfirmed && trend_confirmed && momentumProxy && Number(vratio) >= 2) {
      // Momentum event (no A01)
      reasonsByAxis.alerts.push('حركة زخم قوية ضمن ترند صاعد مؤكد (تم تجاهل A01 لتقليل الإشارات الكاذبة).');
    } else if (!isUptrendConfirmed) {
      alerts.push({
        code: 'A01',
        level: 'HIGH',
        title: 'نمط تلاعب محتمل (Trap)',
        message: 'اجتماع ارتفاع قوي + تشبع RSI + ابتعاد عن EMA20 مع سيولة غير طبيعية بدون تأكيد ترند كافٍ.',
      });
    } else {
      // Uptrend but not confirmed enough -> downgrade
      alerts.push({
        code: 'A01',
        level: 'MED',
        title: 'زخم مرتفع (مراقبة)',
        message: 'زخم قوي لكن تأكيد الترند غير مكتمل — راقب السيولة والبنية السعرية.',
      });
    }
  }

  // A02: Bearish Divergence
  // If provider history is available, use it. Otherwise, we try DB-based history (if provided by marketData).
  const dbCloses = (data.dbHistory?.closes || []).map(Number).filter(Number.isFinite);

  let divFound = false;
  let divIdx = null;

  if (hasHistory) {
    const tailCloses = closes.slice(-120);
    const tailRsi = rsiSeries.slice(-120);
    const div = detectBearishDivergence(tailCloses, tailRsi);
    divFound = div.found;
    divIdx = div.idx; // index within tail arrays
    if (divIdx !== null) {
      // translate to index within full candles slice
      divIdx = (candles.length - tailCloses.length) + divIdx;
    }
  } else if (dbCloses.length >= 30) {
    const tailCloses = dbCloses.slice(-120);
    const tailRsi = rsi(dbCloses, 14).slice(-120);
    const div = detectBearishDivergence(tailCloses, tailRsi);
    divFound = div.found;
    divIdx = null;
  }

  if (divFound) {
    const at = (divIdx !== null && data.candles?.[divIdx]?.t) ? data.candles[divIdx].t : (latest.as_of || latest.date || null);
    alerts.push({
      code: 'A02',
      level: 'HIGH',
      title: 'انحراف زخم سلبي',
      message: 'السعر يسجل قمم أعلى بينما RSI يسجل قمم أقل: احتمال انعكاس/تصريف.',
      at,
    });
  }

  // A03: Overextended
  if (indicators.sma20) {
    const dist = Math.abs(pct(price, Number(indicators.sma20)));
    if (dist > mergedSettings.overextended.pctFromSma20) {
      alerts.push({
        code: 'A03',
        level: 'MED',
        title: 'تضخم سعري',
        message: `السعر بعيد عن متوسط ٢٠ يوم بنسبة ${dist.toFixed(1)}٪ (مخاطرة دخول مرتفعة).`,
      });
    }
  }
  // A04: Sentiment vs Reality (Manual now, Provider later) — Explainable
  {
    const hype = sentiment?.hype_score;
    const sev = sentiment?.news_severity;

    // Heat/confirmation conditions
    const heat = (
      (Number.isFinite(volRatio20) && volRatio20 >= 2) ||
      (Number.isFinite(gapPct) && gapPct >= 2.5)
    );

    const hasA01High = alerts.some(a => a.code === 'A01' && String(a.level).toUpperCase() === 'HIGH');
    const hasC01 = clusters?.some ? clusters.some(c => c.code === 'C01') : false;

    if (Number.isFinite(hype) && Number.isFinite(sev) && hype >= 70 && sev <= 30 && (heat || hasA01High || hasC01)) {
      const level = (hype >= 85 && sev <= 20) ? 'HIGH' : 'MED';
      const reasons_ar = [
        'ارتفاع ضجيج غير مبرر',
        'قوة خبر رسمي منخفضة',
        (heat ? 'سخونة حجم/فجوة تؤكد الضجيج' : (hasA01High || hasC01) ? 'مصائد/نمط مركب يعزز الشبهة' : 'مؤشرات حرارة إضافية')
      ];
      alerts.push({
        code: 'A04',
        level,
        title: 'تلاعب عاطفي/إخباري',
        message: 'ضجيج مرتفع بدون خبر رسمي قوي: احتمال تضخيم/تطبيل.',
        reasons_ar
      });
    }
  }

  // A05: Smart Money (v1.8 improved)
  // يُطلق إذا:
  // - SMF-Pro تصريف قوي
  // - أو SMF-Lite + Divergence سلبي
  // - أو InstitutionalFlow تصريف قوي بثقة عالية (Intraday)
  {
    const strongDist = smf.available && smf.signal === 'DISTRIBUTION' && smf.score <= 40;
    const liteWithDiv = smf.available && (smf.type === 'LITE') && smf.signal === 'DISTRIBUTION' && alerts.some((a) => a.code === 'A02');
    const instStrong = institutionalFlow?.available && institutionalFlow.signal === 'DISTRIBUTION' && institutionalFlow.score <= 45 && institutionalFlow.confidence === 'HIGH';
    if (strongDist || liteWithDiv || instStrong) {
      alerts.push({
        code: 'A05',
        level: 'HIGH',
        title: 'رادار السيولة الذكية',
        message: instStrong
          ? 'إشارة تصريف مؤسسي قوية (Institutional Flow) مع دعم Intraday/VWAP — احتمال خروج سيولة كبيرة.'
          : strongDist
            ? 'إشارة تصريف قوية من مؤشر السيولة الذكية (SMF): احتمال خروج سيولة كبيرة.'
            : 'تصريف (SMF-Lite) مع انحراف RSI سلبي: احتمالية تصريف أعلى.',
      });
    }
  }

  // A06: Social Hype (v1.6)
  if (data.sentiment?.flag === 'HYPE_WITHOUT_OFFICIAL') {
    // Keep A04 for backward-compat, but add a more explicit v1.6 code.
    alerts.push({
      code: 'A06',
      level: 'MED',
      title: 'تطبيل/ضجيج اجتماعي',
      message: 'ضجيج اجتماعي مرتفع بدون إفصاح رسمي: قد يكون تضخيمًا إعلاميًا.',
    });
  }

  // A07: Volume Anomaly (v1.6)
  if (volumeAnomaly.available && volumeAnomaly.flag === 'SPIKE' && Math.abs(priceChangePct) >= 3) {
    alerts.push({
      code: 'A07',
      level: 'MED',
      title: 'شذوذ في السيولة',
      message: `قفزة غير طبيعية في حجم التداول (z=${volumeAnomaly.z}) مع حركة سعر ملحوظة: راقب احتمال تلاعب/تصريف.`,
    });
  }


  // C01: Risk Cluster (v3.2) — does not replace alerts, adds a manager summary
  const hasA01H = alerts.some(a => a.code === 'A01' && String(a.level || a.severity).toUpperCase() === 'HIGH');
  const hasA02 = alerts.some(a => a.code === 'A02' && ['MED','HIGH'].includes(String(a.level || a.severity).toUpperCase()));
  const hasA03 = alerts.some(a => a.code === 'A03' && ['MED','HIGH'].includes(String(a.level || a.severity).toUpperCase()));
  
  // v3.3: Social Truth Detector (Proxy)
  const socialSpike = !!(mergedSettings?.socialSpike || mergedSettings?.social_spike);
  const noDisclosure = !!(mergedSettings?.noOfficialDisclosure || mergedSettings?.no_official_disclosure);
  const hypeScore = (mergedSettings?.socialHypeScore ?? mergedSettings?.social_hype_score);
  if ((socialSpike && noDisclosure) || (hypeScore != null && Number(hypeScore) >= 80 && noDisclosure)) {
    alerts.push({ code: 'A04', severity: 'MED', title_ar: 'ضجيج اجتماعي بدون إفصاح', message_ar: 'ارتفاع الضجيج بدون إفصاح رسمي. ارفع الحذر ولا تعتمد على العاطفة.' });
  }
const clusters = [];
  if (hasA01H && (hasA02 || hasA03)) {
    clusters.push({
      code: 'C01',
      severity: 'HIGH',
      title_ar: 'نمط تلاعب مركب مكتشف',
      message_ar: 'حجم/سيولة غير طبيعية + إشارات ضعف (انحراف زخم أو تضخم سعري).',
    });
    reasonsByAxis.alerts.push('تجميع إشارات الخطر: (A01 + A02/A03) ⇒ C01.');
  }
  // ---------------------
  // Trust Score
  // ---------------------
  // Technical subscore (0..100)
  let tech = 50;
  if (indicators.sma200 && mergedSettings.trendBreak.requireAboveSma200) {
    if (price >= Number(indicators.sma200)) {
      tech += 15;
      reasonsByAxis.technical.push('السعر فوق متوسط ٢٠٠ يوم (اتجاه عام أفضل).');
    } else {
      tech -= 15;
      reasonsByAxis.technical.push('السعر تحت متوسط ٢٠٠ يوم (اتجاه عام ضعيف).');
    }
  }
  if (indicators.rsi14 != null) {
    const r = Number(indicators.rsi14);
    if (r > 70) {
      tech -= 10;
      reasonsByAxis.technical.push('RSI مرتفع (>70): السهم قد يكون متضخمًا سعريًا.');
    } else if (r < 30) {
      tech -= 5; // oversold isn't always safe
      reasonsByAxis.technical.push('RSI منخفض (<30): لا يعني أمانًا تلقائيًا (قد يستمر الهبوط).');
    } else {
      tech += 8;
      reasonsByAxis.technical.push('RSI ضمن نطاق طبيعي (تقريبًا 30–70).');
    }
  }
  if (vratio >= 1.2) {
    tech += 8;
    reasonsByAxis.technical.push(`سيولة أعلى من متوسط ٢٠ يوم (VolRatio ${vratio.toFixed(2)}).`);
  }
  if (vratio <= 0.8) {
    tech -= 8;
    reasonsByAxis.technical.push(`سيولة أقل من متوسط ٢٠ يوم (VolRatio ${vratio.toFixed(2)}).`);
  }
  // Dynamic penalty multipliers (v3.2)
  const mult = (function() {
    if (regime === 'UPTREND') return { A01: 0.9, A02: 1.0, A03: 0.7 };
    if (regime === 'DOWNTREND') return { A01: 1.0, A02: 1.2, A03: 1.1 };
    return { A01: 1.2, A02: 1.0, A03: 1.15 }; // RANGE
  })();

  if (alerts.some((a) => a.code === 'A01' && String(a.level||a.severity).toUpperCase() !== 'LOW')) tech -= Math.round(18 * mult.A01);
  if (alerts.some((a) => a.code === 'A02' && String(a.level||a.severity).toUpperCase() !== 'LOW')) tech -= Math.round(12 * mult.A02);
  if (alerts.some((a) => a.code === 'A03' && String(a.level||a.severity).toUpperCase() !== 'LOW')) tech -= Math.round(8 * mult.A03);
  tech = clamp(tech, 0, 100);

  // Fundamentals subscore (placeholders if not available)
  const f = data.fundamentals ?? {};
  let fund = 50;
  if (Number.isFinite(f.roe)) {
    if (f.roe >= 15) {
      fund += 10;
      reasonsByAxis.fundamentals.push(`ROE جيد (${Number(f.roe).toFixed(1)}).`);
    } else {
      fund -= 6;
      reasonsByAxis.fundamentals.push(`ROE منخفض (${Number(f.roe).toFixed(1)}).`);
    }
  }
  if (Number.isFinite(f.debt_equity)) {
    if (f.debt_equity <= 1) {
      fund += 8;
      reasonsByAxis.fundamentals.push(`مستوى مديونية مقبول (Debt/Equity ${Number(f.debt_equity).toFixed(2)}).`);
    } else {
      fund -= 10;
      reasonsByAxis.fundamentals.push(`مديونية مرتفعة (Debt/Equity ${Number(f.debt_equity).toFixed(2)}).`);
    }
  }
  if (Number.isFinite(f.operating_margin)) {
    if (f.operating_margin >= 10) {
      fund += 6;
      reasonsByAxis.fundamentals.push(`هامش تشغيلي جيد (${Number(f.operating_margin).toFixed(1)}).`);
    } else {
      fund -= 6;
      reasonsByAxis.fundamentals.push(`هامش تشغيلي ضعيف (${Number(f.operating_margin).toFixed(1)}).`);
    }
  }

  // v1.6: Sector-relative valuation impact (only if P/E exists)
  if (sectorValuation.available) {
    if (sectorValuation.valuation === 'OVERVALUED') {
      fund -= 8;
      reasonsByAxis.fundamentals.push(`التقييم أعلى من متوسط القطاع (P/E ${sectorValuation.stockPE.toFixed(1)} مقابل ${sectorValuation.sectorPE}).`);
    } else if (sectorValuation.valuation === 'UNDERVALUED') {
      fund += 4;
      reasonsByAxis.fundamentals.push(`التقييم أقل من متوسط القطاع (P/E ${sectorValuation.stockPE.toFixed(1)}).`);
    } else {
      reasonsByAxis.fundamentals.push('التقييم قريب من متوسط القطاع (P/E).');
    }
  }
  fund = clamp(fund, 0, 100);

  // Sentiment subscore (MVP = neutral unless provided)
  let sent = 50;
  if (data.sentiment?.score != null) sent = clamp(50 + data.sentiment.score * 50, 0, 100);
  if (alerts.some((a) => a.code === 'A04')) sent -= 10;
  sent = clamp(sent, 0, 100);

  if (data.sentiment?.score != null) {
    reasonsByAxis.sentiment.push(`تقييم المشاعر (يدوي/Keywords): ${(Number(data.sentiment.score)).toFixed(2)}.`);
  } else {
    reasonsByAxis.sentiment.push('المشاعر: افتراضي (لا يوجد مصدر أخبار فعلي في هذا الإصدار).');
  }
  if (alerts.some((a) => a.code === 'A04')) reasonsByAxis.sentiment.push('تنبيه ضجيج بلا إفصاح رسمي (A04).');

  // v1.8: SMF / Institutional Flow / Earnings Growth explainability
  if (smf.available) {
    const smfTxt = smf.signal === 'ACCUMULATION' ? 'تجميع' : 'تصريف';
    reasonsByAxis.technical.push(`SMF (${smf.type}): ${smfTxt} — درجة ${smf.score}.`);
  } else {
    reasonsByAxis.technical.push('SMF: غير متاح (لا توجد بيانات كافية).');
  }

  if (institutionalFlow.available) {
    const itxt = institutionalFlow.signal === 'ACCUMULATION'
      ? 'تجميع مؤسسي محتمل'
      : institutionalFlow.signal === 'DISTRIBUTION'
        ? 'تصريف مؤسسي محتمل'
        : 'إشارة مختلطة';
    reasonsByAxis.technical.push(`Institutional Flow: ${itxt} — ثقة ${institutionalFlow.confidence} (درجة ${institutionalFlow.score}).`);
  } else {
    reasonsByAxis.technical.push('Institutional Flow: غير متاح (Intraday اختياري).');
  }

  if (earningsGrowth.available) {
    reasonsByAxis.fundamentals.push(`اتجاه نمو الأرباح/الإيرادات: ${earningsGrowth.signal} (درجة ${earningsGrowth.score}).`);
  } else {
    reasonsByAxis.fundamentals.push('اتجاه نمو الأرباح/الإيرادات: غير متاح (لا توجد بيانات ربع سنوية كافية).');
  }

  // نُبقي جودة الأرباح كـ "معلومة إضافية" (غير إلزامية في الوزن)
  if (earningsQuality.available) {
    reasonsByAxis.fundamentals.push(`جودة الأرباح (Proxy): ${earningsQuality.flag} (درجة ${earningsQuality.qualityScore}).`);
  }

  if (volumeAnomaly.available) {
    if (volumeAnomaly.flag === 'SPIKE') reasonsByAxis.technical.push(`شذوذ سيولة: قفزة غير طبيعية (z=${volumeAnomaly.z}).`);
    if (volumeAnomaly.flag === 'DRY') reasonsByAxis.technical.push(`شذوذ سيولة: جفاف في التداول (z=${volumeAnomaly.z}).`);
  }

  // v1.8: Extra components
  const smfScore = smf.available ? Number(smf.score) : null;
  const instScore = institutionalFlow.available ? Number(institutionalFlow.score) : null;
  const earnGrowthScore = earningsGrowth.available ? Number(earningsGrowth.score) : null;

  // Dynamic weights: drop unavailable components and rebalance
  const baseW = { ...mergedSettings.weights };
  const availability = {
    technical: true,
    fundamentals: true,
    sentiment: true,
    smf: smfScore != null,
    institutional: instScore != null,
    earningsGrowth: earnGrowthScore != null,
  };
  const sumW = Object.entries(baseW).reduce((acc, [k, v]) => acc + (availability[k] ? v : 0), 0);
  const w = {};
  for (const [k, v] of Object.entries(baseW)) {
    w[k] = availability[k] ? (v / (sumW || 1)) : 0;
  }

  // ---------------------
  // Trust Score (0..100)
  // ---------------------
  let score = Math.round(
    tech * w.technical +
    fund * w.fundamentals +
    sent * w.sentiment +
    (smfScore != null ? smfScore * w.smf : 0) +
    (instScore != null ? instScore * w.institutional : 0) +
    (earnGrowthScore != null ? earnGrowthScore * w.earningsGrowth : 0)
  );

  // ---------------------
  // Iceberg Detection — PRO Intraday only (A09)
  // ---------------------
  const tfKey = String(tf || 'D').toUpperCase();
  const isIntradayTf = (tfKey === '1M' || tfKey === '5M' || tfKey === 'INTRADAY');
  const isProMode = String(settings?.data_mode || '').toLowerCase() === 'pro' || String(data?.mode || '').toLowerCase() === 'pro';

  let iceberg = null;
  let icebergBlockGreen = false;
  if (isProMode && isIntradayTf && Array.isArray(data?.intraday) && data.intraday.length >= 30) {
    try {
      iceberg = detectIceberg({ intradayCandles: data.intraday });
      if (iceberg?.triggered) {
        // Create Alert A09
        alerts.push({
          code: 'A09',
          severity: 'HIGH',
          title_ar: 'تصريف خفي (Iceberg)',
          message_ar: 'حجم مرتفع دون تقدم سعري مع سلوك امتصاص/تصريف خفي داخل الإطار اللحظي.',
          reasons: iceberg.reasons || [],
        });

                if (Array.isArray(clusters) && clusters.some(c => c.code === 'C01')) {
          reasonsByAxis.alerts.push('A09 عزّز قراءة نمط C01 (تلاعب مركب) عند توفره.');
        }

reasonsByAxis.alerts.push('A09: تم رصد امتصاص سيولة/تصريف خفي داخل الشموع الصغيرة (Iceberg).');
        (iceberg.reasons || []).forEach(r => reasons.push(r));
        reasons.push('تم خفض Trust Score بسبب تصريف خفي محتمل داخل الإطار اللحظي.');

        // Penalty قوي (مقترح -20)
        const penalty = 20;
        score = clamp(score - penalty, 0, 100);

        // Prevent strong GREEN
        icebergBlockGreen = true;
      }
    } catch (_) {
      iceberg = null;
    }
  }

  let trafficRaw = trafficFromScore(score);
  if (icebergBlockGreen && trafficRaw === 'GREEN') trafficRaw = 'YELLOW';

  // Apply Correlation Guard (may downgrade confidence + add A08)
  try {
    if (global_context) {
      const marketBenchmark = { symbol: global_context.benchmark, change_pct: global_context.benchmark_change_pct };
      const refs = global_context.refs || [];

      const r = applyCorrelationGuard({
        symbol,
        market,
        stockChange: priceChangePct,
        marketBenchmark,
        refs,
        regime,
        trend_confirmed,
        confidence,
        trafficRaw,
        alerts,
        reasons,
        flags: globalFlags,
      });

      confidence = r.confidence;

      if (globalFlags.length) {
        global_context.flags = Array.from(new Set([...(global_context.flags || []), ...globalFlags]));
      }
    }
  } catch (_) {}

  let traffic = trafficWithLowConfidence(trafficRaw, confidence);

  if (confidence === 'LOW' && traffic === 'RED') {
    traffic = 'YELLOW';
    reasons.push('البيانات متأخرة/ناقصة: تم تخفيف الحكم.');
  }

  const scoreBreakdown = {
    technical: tech,
    fundamentals: fund,
    sentiment: sent,
    smf: smfScore,
    institutional: instScore,
    earningsGrowth: earnGrowthScore,
    weights: { ...w },
    weighted: {
      technical: Math.round(tech * w.technical),
      fundamentals: Math.round(fund * w.fundamentals),
      sentiment: Math.round(sent * w.sentiment),
      smf: smfScore != null ? Math.round(smfScore * w.smf) : 0,
      institutional: instScore != null ? Math.round(instScore * w.institutional) : 0,
      earningsGrowth: earnGrowthScore != null ? Math.round(earnGrowthScore * w.earningsGrowth) : 0,
    },
    final: score,
  };
  // v3.2.2: Manager+Analyst assistant output (no UI change)
  const features = {
    rsi14: indicators.rsi14,
    dist_ema20_pct: dist_ema20_pct,
    vol_ratio20: indicators.vol_ratio20
  };
  const assistant = buildAssistantOutput({ traffic, regime, trend_confirmed, confidence, features, alerts, clusters, global_context, settings, tf });

  // v2.3.2: Auto Decision (Conservative profile)
  const decision_auto = buildDecision({
    market,
    owned: !!settings?.owned,
    exposure: settings?.exposure || 'MED',
    score,
    traffic,
    regime,
    trend_confirmed,
    confidence,
    global_context: global_context || null,
    clusters,
    assistant,
    signals: (alerts || []).map(a => ({
      code: a.code,
      severity: String(a.severity || a.level || '').toUpperCase() || 'MED',
      title_ar: a.title_ar || a.title || '',
      message_ar: a.message_ar || a.message || '',
      at: a.at || null,
    })),
    regime,
    trend_confirmed,
    confidence,
    global_context: global_context || null,
    clusters,
    signals: (alerts || []).map(a => ({
      code: a.code,
      severity: String(a.severity || a.level || '').toUpperCase() || 'MED',
      title_ar: a.title_ar || a.title || '',
      message_ar: a.message_ar || a.message || '',
    })),
    indicators: { ...indicators, price: quote?.price ?? null },
    smf,
    instFlow: institutional_flow || institutionalFlow || null,
    alerts,
    candles: (data.candles || []).map(c => ({
      t: c.t || c.time || c.date,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume || 0),
    })).filter(x => x.t && Number.isFinite(x.close)),
    riskProfile: (settings?.riskProfile || 'conservative'),
  });

  const sr = {
    support: decision_auto?.support ?? null,
    resistance: decision_auto?.resistance ?? null
  };


  // Reasons (explainable output)
  if (traffic === 'GREEN') reasons.push('درجة ثقة مرتفعة: شروط الفلاتر الأساسية جيدة.');
  if (traffic === 'YELLOW') reasons.push('درجة متوسطة: يوجد عوامل تستدعي الحذر.');
  if (traffic === 'RED') reasons.push('درجة منخفضة: مخاطر/إنذارات واضحة.');
  reasons.push(...reasonsByAxis.technical);
  reasons.push(...reasonsByAxis.fundamentals);
  reasons.push(...reasonsByAxis.sentiment);
  for (const a of alerts) {
    const line = `تنبيه ${a.code}: ${a.title}.`;
    reasons.push(line);
    reasonsByAxis.alerts.push(line);
  }


  // v1.9: Decision Support tag (rules-based)
  const decision = computeDecision({
    score,
    traffic,
    alerts,
    indicators,
    smf: smf.available ? { signal: smf.signal, score: smf.score } : { signal: null, score: null },
    institutionalFlow,
    earningsGrowth,
    riskProfile: mergedSettings?.riskProfile || 'balanced',
  });
  const opportunity = computeOpportunityRadar({
    traffic,
    score,
    indicators,
    fundamentals: {
      pe: f.pe ?? null,
      debt_equity: f.debt_equity ?? null,
      roe: f.roe ?? null,
      operating_margin: f.operating_margin ?? null,
    },
    alerts,
    smf: smf.available ? { signal: smf.signal, score: smf.score } : { signal: null, score: null },
    institutionalFlow,
    earningsGrowth,
    sectorValuation,
  });

  const exit = computeExitRadar({
    indicators,
    alerts,
    smf: smf.available ? { signal: smf.signal, score: smf.score } : { signal: null, score: null },
    institutionalFlow,
    earningsGrowth,
  });

  

// ------------------------------
// v2.3.2 — Auto Decision Engine (Conservative)
// ------------------------------
function atr14(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const prevClose = Number(candles[i-1].close);
    const h = Number(candles[i].high);
    const l = Number(candles[i].low);
    if (![prevClose,h,l].every(Number.isFinite)) continue;
    const tr = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
    trs.push(tr);
  }
  if (trs.length < period) return null;
  const last = trs.slice(-period);
  const avg = last.reduce((a,b)=>a+b,0) / last.length;
  return avg || null;
}

function nearestLevels(candles, lookback = 180, pivotWindow = 3, tolerancePct = 0.006, currentPrice = null) {
  // TradingView-like: detect pivot highs/lows then cluster into levels.
  const arr = Array.isArray(candles) ? candles.slice(-lookback) : [];
  if (arr.length < (pivotWindow * 2 + 5)) return { support: null, resistance: null, levels: [] };

  const pivots = [];
  for (let i = pivotWindow; i < arr.length - pivotWindow; i++) {
    const h = Number(arr[i].high);
    const l = Number(arr[i].low);
    if (!Number.isFinite(h) || !Number.isFinite(l)) continue;

    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= pivotWindow; k++) {
      const h1 = Number(arr[i - k].high), h2 = Number(arr[i + k].high);
      const l1 = Number(arr[i - k].low), l2 = Number(arr[i + k].low);
      if (Number.isFinite(h1) && h <= h1) isHigh = false;
      if (Number.isFinite(h2) && h <= h2) isHigh = false;
      if (Number.isFinite(l1) && l >= l1) isLow = false;
      if (Number.isFinite(l2) && l >= l2) isLow = false;
    }
    if (isHigh) pivots.push({ type: 'R', price: h });
    if (isLow) pivots.push({ type: 'S', price: l });
  }

  // Cluster by tolerance
  const clusters = [];
  const tol = (p) => Math.abs(p) * tolerancePct;
  for (const p of pivots) {
    const t = tol(p.price);
    const existing = clusters.find(c => Math.abs(c.price - p.price) <= t);
    if (existing) {
      existing.count += 1;
      existing.price = (existing.price * (existing.count - 1) + p.price) / existing.count;
      existing.types.add(p.type);
    } else {
      clusters.push({ price: p.price, count: 1, types: new Set([p.type]) });
    }
  }

  // Rank by strength (touch count)
  clusters.sort((a,b)=> b.count - a.count);

  const levels = clusters.slice(0, 12).map(c => ({
    price: c.price,
    strength: c.count,
    kind: c.types.has('S') && c.types.has('R') ? 'BOTH' : (c.types.has('S') ? 'SUPPORT' : 'RESISTANCE')
  }));

  const px = Number.isFinite(Number(currentPrice)) ? Number(currentPrice) : null;
  let support = null, resistance = null;
  if (px !== null) {
    const below = levels.filter(lv => lv.price <= px).sort((a,b)=> b.price - a.price);
    const above = levels.filter(lv => lv.price >= px).sort((a,b)=> a.price - b.price);
    support = below[0]?.price ?? null;
    resistance = above[0]?.price ?? null;
  } else {
    // fallback using last window
    const lastWin = arr.slice(-20);
    const lows = lastWin.map(c => Number(c.low)).filter(Number.isFinite);
    const highs = lastWin.map(c => Number(c.high)).filter(Number.isFinite);
    support = lows.length ? Math.min(...lows) : null;
    resistance = highs.length ? Math.max(...highs) : null;
  }

  return { support, resistance, levels };
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function buildDecision({ market, owned, exposure, score, traffic, indicators, smf, instFlow, alerts, candles, riskProfile }) {
  // Conservative defaults
  const price = Number(indicators?.price || indicators?.last_price || indicators?.close || indicators?.quote_price);
  const sma200 = Number(indicators?.sma200);
  const sma20 = Number(indicators?.sma20);
  const rsi = Number(indicators?.rsi14);
  const hasPrice = Number.isFinite(price);

  const lvl = nearestLevels(candles, 220, 3, 0.006, price);
  const { support, resistance } = lvl;
  const levels = lvl.levels || [];
  const atr = atr14(candles, 14);

  const hiAlerts = (alerts || []).filter(a => (a.severity || a.level || '').toString().toUpperCase() === 'HIGH');
  const hasHighRisk = hiAlerts.length > 0 || traffic === 'RED' || (score !== null && score < 50);

  const smfAvail = !!smf?.available;
  const smfSignal = (smf?.signal || '').toString().toUpperCase();
  const smfAccum = smfAvail && smfSignal === 'ACCUMULATION';
  const smfDistrib = smfAvail && smfSignal === 'DISTRIBUTION';

  const inst = (instFlow?.signal || '').toString().toUpperCase();
  const instPos = inst === 'BUYING' || inst === 'ACCUMULATION' || inst === 'POSITIVE';
  const instNeg = inst === 'SELLING' || inst === 'DISTRIBUTION' || inst === 'NEGATIVE';

  const above200 = Number.isFinite(sma200) && hasPrice ? price >= sma200 : null;
  const overextended = Number.isFinite(sma20) && hasPrice ? (price / sma20) > 1.15 : false;

  const reasons = [];
  const plan = { mode: 'CONSERVATIVE', action: 'WATCH', confidence: 50, entry: null, stop: null, target1: null, target2: null, support: support ?? null, resistance: resistance ?? null, levels, notes: [] };

  // Confidence base from Trust Score
  if (typeof score === 'number') plan.confidence = clamp(Math.round(score), 0, 100);

  // If no price, fallback
  if (!hasPrice) {
    plan.action = owned ? 'HOLD' : 'WATCH';
    plan.notes.push('لا تتوفر بيانات سعر كافية لبناء خطة دخول/خروج.');
    return plan;
  }

  // Owner logic: trim/exit smarter by exposure
  const exp = (exposure || 'MED').toString().toUpperCase(); // LOW/MED/HIGH
  const expHigh = exp === 'HIGH';
  const expLow = exp === 'LOW';

  if (owned) {
    if (hasHighRisk || smfDistrib || instNeg) {
      plan.action = expHigh ? 'EXIT' : 'TRIM';
      plan.notes.push('إشارات خطر/تصريف: تنبيهات عالية أو سيولة ذكية تصريف أو تدفق مؤسسي سلبي.');
      if (expHigh) plan.notes.push('نسبة التعرض عالية → القرار يميل للخروج الكامل لتخفيض المخاطر.');
      else plan.notes.push('نسبة التعرض ليست عالية → القرار يميل لتخفيف الكمية (TRIM) بدل الخروج الكامل.');
    } else if (!overextended && above200 && (smfAccum || instPos) && (traffic === 'GREEN' || score >= 70)) {
      plan.action = expLow ? 'ADD' : 'HOLD';
      plan.notes.push('الاتجاه العام داعم (فوق MA200) + سيولة/تدفق إيجابي → احتفاظ، ومع تعرّض منخفض يمكن تعزيز تدريجي.');
    } else {
      plan.action = 'HOLD';
      plan.notes.push('لا توجد إشارة خروج قوية ولا إشارة تعزيز قوية: الاحتفاظ مع مراقبة.');
    }
  } else {
    // Not owned: entry decision
    if (hasHighRisk || smfDistrib || instNeg) {
      plan.action = 'AVOID';
      plan.notes.push('مخاطر مرتفعة/تصريف: الأفضل تجنّب الدخول الآن.');
    } else if (above200 && !overextended && (smfAccum || instPos) && (traffic === 'GREEN' || score >= 75)) {
      // Conservative entry prefers pullback near support
      plan.action = 'ENTER';
      plan.notes.push('الشروط الأساسية متحققة (فوق MA200 + لا تمدد + سيولة/تدفق إيجابي) → مناسب للدخول المحافظ.');
    } else {
      plan.action = 'WATCH';
      plan.notes.push('الشروط غير مكتملة للدخول المحافظ: راقب حتى تكتمل إشارات الاتجاه/السيولة.');
    }
  }

  // Build numeric plan if we have levels
  const entry = price;
  let stop = null;
  let target1 = null;
  let target2 = null;

  if (Number.isFinite(support)) {
    stop = support * 0.97; // 3% below support (conservative)
  }
  if (atr && Number.isFinite(atr)) {
    const atrStop = price - 1.5 * atr;
    stop = stop === null ? atrStop : Math.min(stop, atrStop);
    const atrT1 = price + 2.0 * atr;
    target1 = atrT1;
    const atrT2 = price + 3.5 * atr;
    target2 = atrT2;
  }
  if (Number.isFinite(resistance)) {
    // cap target1 by resistance
    target1 = target1 === null ? resistance : Math.min(target1, resistance);
    // target2 can be above resistance if breakout, but conservative keep near resistance
    target2 = target2 === null ? resistance : Math.min(target2, resistance * 1.02);
  }

  plan.entry = (plan.action === 'ENTER' || plan.action === 'WATCH' || plan.action === 'AVOID') ? round2(entry) : null;
  plan.stop = (stop !== null && Number.isFinite(stop)) ? round2(stop) : null;
  plan.target1 = (target1 !== null && Number.isFinite(target1)) ? round2(target1) : null;
  plan.target2 = (target2 !== null && Number.isFinite(target2)) ? round2(target2) : null;

  // Add indicator-based notes
  if (Number.isFinite(rsi)) {
    if (rsi >= 70) plan.notes.push('RSI مرتفع (تشبع شراء) → ادخل بحذر/انتظر هدوء.');
    if (rsi <= 30) plan.notes.push('RSI منخفض (تشبع بيع) → ليس خطر تلقائيًا لكن يلزم تأكيد اتجاه.');
  }
  if (above200 === false) plan.notes.push('السعر تحت MA200 → الاتجاه العام غير داعم للمحافظ.');
  if (overextended) plan.notes.push('السعر ممتد فوق SMA20 بأكثر من 15% → احتمال جني أرباح قريب.');

  return plan;
}

function round2(x){ return Math.round(x * 100) / 100; }


// ---- Context + Smart Money (Render Restored) ----
// Restore engines without changing core scoring or API schema.
try {
  const _ctxRegime = ContextEngine.determineRegime({
    currentPrice: latest?.price,
    sma20: indicators?.sma20,
    sma200: indicators?.sma200,
    ema20: indicators?.ema20,
    atr: indicators?.atr14,
    avgPrice: indicators?.avgPrice || latest?.price
  });
  if (!regime && _ctxRegime) regime = _ctxRegime;
} catch (_) {}

let smart_money = null;
try {
  const _candles = (data?.candles || []).map(c => ({
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volume || 0),
    ts: c.t || c.time || c.date || null
  })).filter(x => Number.isFinite(x.close));

  const market_change_pct = (global_context && global_context.primary) ? Number(global_context.primary.change_pct) : null;

  smart_money = SmartMoney.analyze({
    candles: _candles,
    indicators: {
      ema20: indicators?.ema20,
      sma50: indicators?.sma50,
      atr14: indicators?.atr14,
      rsi14: indicators?.rsi14,
      vol_ratio20: indicators?.vol_ratio20,
      regime,
      confidence,
      market_change_pct: Number.isFinite(market_change_pct) ? market_change_pct : undefined
    },
    settings: { include_debug: false }
  });
} catch (_) {
  smart_money = null;
}
// ---- End Context + Smart Money ----


// ---- Context Engine (UI-visible meta) ----
let ctx_engine = null;
try {
  const currentPrice = Number(latest?.price);
  const sma20 = Number(indicators?.sma20);
  const sma200 = Number(indicators?.sma200);
  const ema20 = Number(indicators?.ema20);
  const atr14 = Number(indicators?.atr14);
  const avgPrice = Number(indicators?.avgPrice || latest?.price);

  const ctxRegime = ContextEngine.determineRegime({
    currentPrice,
    sma20: Number.isFinite(sma20) ? sma20 : undefined,
    sma200: Number.isFinite(sma200) ? sma200 : undefined,
    ema20: Number.isFinite(ema20) ? ema20 : undefined,
    atr: Number.isFinite(atr14) ? atr14 : undefined,
    avgPrice
  });

  const shortMA = Number.isFinite(ema20) ? ema20 : (Number.isFinite(sma20) ? sma20 : null);
  const strengthPct = (shortMA && Number.isFinite(currentPrice))
    ? ContextEngine.calculateStrength(currentPrice, shortMA)
    : 0;

  ctx_engine = {
    regime: ctxRegime,
    strength_pct: strengthPct,
  };
} catch (_) {
  ctx_engine = null;
}
// ---- End Context Engine ----


return {
    symbol,
    market,
    tf,
    quote: {
      price: latest.price,
      change_percent: priceChangePct,
      volume: latest.volume,
      currency: latest.currency,
      as_of: data.as_of,
    },
    indicators,
    fundamentals: {
      pe: f.pe ?? null,
      debt_equity: f.debt_equity ?? null,
      roe: f.roe ?? null,
      operating_margin: f.operating_margin ?? null,
    },
    score,
    traffic,
    regime,
    trend_confirmed,
    confidence,
    liquidity,
    global_context: global_context || null,
    clusters,
    assistant,
    signals: (alerts || []).map(a => ({
      code: a.code,
      severity: String(a.severity || a.level || '').toUpperCase() || 'MED',
      title_ar: a.title_ar || a.title || '',
      message_ar: a.message_ar || a.message || '',
      at: a.at || null,
    })),
    decision,
    opportunity,
    exit,
    smf: smf.available ? {
      available: true,
      type: smf.type,
      score: smf.score,
      signal: smf.signal,
    } : { available: false },
    institutionalFlow,
    sectorValuation,
    earningsGrowth,
    earningsQuality,
    volumeAnomaly,
    alerts,
    reasons,
    reasonsByAxis,
    scoreBreakdown,
    decision,
    sr,
    history: {
      candles: (data.candles || []).slice(-600).map(c => ({
        t: c.t || c.time || c.date || null,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume || 0),
      })).filter(x => x.t && Number.isFinite(x.close))
    },
    meta: {
      context_engine: ctx_engine,
      relativeStrength,
      sectorStrength,

      data_mode: (settings?.data_mode || null),
      provider_requested: (settings?.provider || null),
      data_source: (data.data_source || data.provider || null),
      latency_note: (data.latency_note || null),
      data_quality,
      provider: data.provider,
      history_points: closes.length,
      history_ok: hasHistory,
      high_120: hasHistory ? maxN(closes.slice(-120)) : null,
      low_120: hasHistory ? minN(closes.slice(-120)) : null,
      intraday_points: Array.isArray(data.intraday) ? data.intraday.length : 0,
    },
  };
}





function detectMarketRegime(indexData) {
  if (!indexData || !Array.isArray(indexData.closes) || indexData.closes.length < 200) {
    return { regime: "UNKNOWN", score: 50 };
  }

  const closes = indexData.closes;
  const last = closes[closes.length - 1];
  const sma200 = closes.slice(-200).reduce((a,b)=>a+b,0)/200;
  const sma50 = closes.slice(-50).reduce((a,b)=>a+b,0)/50;

  let score = 50;

  if (last > sma200) score += 20;
  if (last > sma50) score += 15;
  if (last < sma200) score -= 20;

  score = Math.max(0, Math.min(100, score));

  let regime = "SIDEWAYS";
  if (score >= 70) regime = "BULLISH";
  if (score <= 35) regime = "RISK_OFF";

  return { regime, score };
}
