// Market data provider layer (MVP)
// Supports: alphavantage (daily), finnhub (daily)
// If no provider key is set, returns empty candles so app can use Demo Mode.

const cache = new Map();

function nowMs() {
  return Date.now();
}

function cacheGet(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (nowMs() > item.exp) {
    cache.delete(key);
    return null;
  }
  return item.val;
}

function cacheSet(key, val, ttlMs) {
  cache.set(key, { val, exp: nowMs() + ttlMs });
}

function normalizeSymbol(symbol, market) {
  const s = String(symbol || '').trim().toUpperCase();
  if (!s) return s;
  // Saudi symbols often like 2222.SR
  // Do NOT suffix indices / commodities / FX pairs
  if (s.startsWith('^')) return s;       // benchmarks like ^TASI, ^GSPC, ^IXIC
  if (s.includes('=')) return s;         // commodities/FX like CL=F, BZ=F
  if (market === 'SA' && !s.includes('.')) return `${s}.SR`;
  return s;
}


function isSaudiSymbol(symbol, market) {
  const s = String(symbol || '').trim().toUpperCase();
  if (String(market||'').toUpperCase() === 'SA') return true;
  if (!s) return false;
  if (s.endsWith('.SR')) return true;
  // Tadawul main-market tickers are commonly 4 digits (e.g., 2222)
  if (/^\d{4}$/.test(s)) return true;
  if (/^\d{4}\.SR$/.test(s)) return true;
  return false;
}

// ------------------------------
// SAHMK (Saudi) — Quote API (Free/Delayed depending on plan)
// Docs: app.sahmk.sa/api/v1/quote/{symbol}/ (requires X-API-Key)
// ------------------------------

// ------------------------------
// SAHMK (Saudi) — Historical candles (Daily) (Plan-dependent)
// Endpoint (per docs/tutorial): /history/{symbol}/
// Returns OHLCV series used by our analyzer.
// ------------------------------
async function sahmkHistory(symbol) {
  try {
    const key = String((process.env.SAHMK_KEY || process.env.SHMK_API_KEY || '')).trim();
    if (!key) return null;

    const raw = String(symbol || '').trim().toUpperCase();
    const sym = raw.endsWith('.SR') ? raw.replace('.SR', '') : raw;

    const url = `https://app.sahmk.sa/api/v1/history/${encodeURIComponent(sym)}/`;
    const r = await fetch(url, { headers: { 'X-API-Key': key } });
    if (!r.ok) return null;

    const data = await r.json();

    // We accept multiple possible shapes:
    // 1) Array of bars: [{date|timestamp, open, high, low, close, volume}, ...]
    // 2) Object with 'candles' or 'history' array
    const arr = Array.isArray(data) ? data : (Array.isArray(data?.candles) ? data.candles : (Array.isArray(data?.history) ? data.history : null));
    if (!Array.isArray(arr) || !arr.length) return null;

    const candles = arr.map((c) => {
      const ts = c.timestamp ?? c.ts ?? c.date ?? c.time ?? null;
      return {
        ts,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume ?? c.vol ?? 0)
      };
    }).filter(c => Number.isFinite(c.open) && Number.isFinite(c.close));

    // Sort ascending by time if possible
    candles.sort((a,b) => String(a.ts).localeCompare(String(b.ts)));

    return { candles };
  } catch (e) {
    return null;
  }
}

async function sahmkQuote(symbol) {
  try {
    const key = String((process.env.SAHMK_KEY || process.env.SHMK_API_KEY || '').trim());
    if (!key) return null;

    // SAHMK expects Saudi numeric symbol without .SR
    const raw = String(symbol || '').trim().toUpperCase();
    const sym = raw.endsWith('.SR') ? raw.replace('.SR', '') : raw;

    const url = `https://app.sahmk.sa/api/v1/quote/${encodeURIComponent(sym)}/`;
    const res = await fetch(url, {
      headers: {
        'X-API-Key': key,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j) return null;

    const price = Number(j.price);
    const change = Number(j.change);
    const change_percent = Number(j.change_percent);
    const volume = Number(j.volume);

    return {
      providerName: 'sahmk',
      data_source: 'sahmk',
      latency_note: j.is_delayed ? 'Delayed' : 'Provider',
      as_of: new Date().toISOString(),
      quote: {
        symbol: sym,
        price: Number.isFinite(price) ? price : null,
        change: Number.isFinite(change) ? change : null,
        change_percent: Number.isFinite(change_percent) ? change_percent : null,
        volume: Number.isFinite(volume) ? volume : null,
        is_delayed: Boolean(j.is_delayed)
      },
      raw: j
    };
  } catch (_) {
    return null;
  }
}



// ------------------------------
// EODHD (مدفوع) — Daily/EOD (SA)
// ------------------------------
async function eodhdDaily(symbol) {
  try {
    const key = String(process.env.EODHD_KEY || process.env.EOD_HISTORICAL_DATA_KEY || '').trim();
    if (!key) return null;
    // EODHD format: https://eodhistoricaldata.com/api/eod/<symbol>?api_token=...&fmt=json&period=d
    const url = `https://eodhistoricaldata.com/api/eod/${encodeURIComponent(symbol)}?api_token=${encodeURIComponent(key)}&fmt=json&period=d&order=d&limit=240`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    if (!Array.isArray(j) || !j.length) return null;
    const candles = j.map(row => ({
      t: new Date(String(row.date)).toISOString(),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    })).filter(c => Number.isFinite(c.close));
    if (!candles.length) return null;
    const last = candles[candles.length - 1];
    const prev = candles.length > 1 ? candles[candles.length - 2] : null;
    const changePercent = prev ? ((last.close - prev.close) / (prev.close || 1)) * 100 : 0;
    return {
      provider: 'eodhd_paid',
      data_source: 'EODHD',
      latency_note: 'EOD',
      as_of: new Date().toISOString(),
      quote: { price: last.close, changePercent, volume: last.volume || 0 },
      candles,
      fundamentals: null,
      sentiment: null,
    };
  } catch (_) {
    return null;
  }
}

// ------------------------------
// Intraday (اختياري) — v1.8
// ------------------------------
// نُبقي الربط اختياريًا بالكامل: إذا فشل أو غير متاح نرجع null بدون كسر النظام.

async function yahooIntraday(symbol, interval = '5m') {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=${encodeURIComponent(interval)}&includePrePost=false&events=div%2Csplits`;
    const r = await fetch(url, { headers: { 'User-Agent': 'MarketSentinel/1.8' } });
    if (!r.ok) return null;
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    if (!res) return null;
    const ts = res.timestamp || [];
    const q = res.indicators?.quote?.[0] || {};
    const out = [];
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      const o = q.open?.[i];
      const c = q.close?.[i];
      const v = q.volume?.[i];
      if (typeof o !== 'number' || typeof c !== 'number' || typeof v !== 'number') continue;
      out.push({
        t: new Date(t * 1000).toISOString(),
        open: Number(o),
        close: Number(c),
        volume: Number(v),
      });
    }
    return out.length ? out : null;
  } catch (_) {
    return null;
  }
}

async function finnhubIntraday(symbol, resolution = '5') {
  try {
    const apiKey = process.env.FINNHUB_KEY || process.env.FINNHUB_API_KEY;
    if (!apiKey) return null;
    const to = Math.floor(Date.now() / 1000);
    const from = to - 2 * 24 * 60 * 60;
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&from=${from}&to=${to}&token=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url);
    const j = await r.json();
    if (j.s !== 'ok') return null;
    const out = j.t
      .map((t, i) => ({
        t: new Date(t * 1000).toISOString(),
        open: Number(j.o[i]),
        close: Number(j.c[i]),
        volume: Number(j.v[i]),
      }))
      .filter((x) => Number.isFinite(x.open) && Number.isFinite(x.close) && Number.isFinite(x.volume));
    return out.length ? out : null;
  } catch (_) {
    return null;
  }
}

async function alphavantageIntraday(symbol, interval = '5min') {
  try {
    const apiKey = process.env.ALPHA_VANTAGE_KEY || process.env.ALPHAVANTAGE_API_KEY;
    if (!apiKey) return null;
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=compact&apikey=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url);
    const j = await r.json();
    const ts = j[`Time Series (${interval})`];
    if (!ts) return null;
    const keys = Object.keys(ts).sort();
    const out = keys
      .map((k) => {
        const o = ts[k];
        return {
          t: new Date(k.replace(' ', 'T') + 'Z').toISOString(),
          open: Number(o['1. open']),
          close: Number(o['4. close']),
          volume: Number(o['5. volume']),
        };
      })
      .filter((x) => Number.isFinite(x.open) && Number.isFinite(x.close) && Number.isFinite(x.volume));
    return out.length ? out : null;
  } catch (_) {
    return null;
  }
}

// ------------------------------
// Quarterly financials (MVP) — v1.8
// ------------------------------

async function yahooQuarterly(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=incomeStatementHistoryQuarterly%2Cearnings%2CfinancialData`;
    const r = await fetch(url, { headers: { 'User-Agent': 'MarketSentinel/1.8' } });
    if (!r.ok) return null;
    const j = await r.json();
    const s = j?.quoteSummary?.result?.[0];
    if (!s) return null;

    const ishq = s.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    const quarterly = ishq
      .map((x) => ({
        endDate: x?.endDate?.raw ? new Date(x.endDate.raw * 1000).toISOString().slice(0, 10) : null,
        revenue: x?.totalRevenue?.raw ?? null,
        netIncome: x?.netIncome?.raw ?? null,
      }))
      .filter((x) => x.endDate);

    const echart = s.earnings?.financialsChart?.quarterly || [];
    const epsQuarterly = echart
      .map((x) => ({ date: x?.date || null, actual: x?.actual?.raw ?? null }))
      .filter((x) => x.date);

    const fd = s.financialData || {};
    const operating_margin = fd?.operatingMargins?.raw != null ? fd.operatingMargins.raw * 100 : null;

    return { provider: 'yahoo_free', quarterly, epsQuarterly, operating_margin };
  } catch (_) {
    return null;
  }
}

async function alphavantageDaily(symbol) {
  const apiKey = process.env.ALPHA_VANTAGE_KEY || process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) return null;
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url);
  const j = await r.json();
  const ts = j['Time Series (Daily)'];
  if (!ts) return null;

  const dates = Object.keys(ts).sort();
  const candles = dates.map((d) => {
    const o = ts[d];
    return {
      t: d,
      open: Number(o['1. open']),
      high: Number(o['2. high']),
      low: Number(o['3. low']),
      close: Number(o['4. close']),
      volume: Number(o['6. volume']),
    };
  });

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] ?? last;
  const changePct = prev?.close ? (last.close - prev.close) / prev.close : 0;

  return {
    provider: 'alphavantage',
    as_of: last.t,
    quote: {
      price: last.close,
      change_percent: changePct,
      volume: last.volume,
      currency: null,
    },
    candles,
  };
}

async function finnhubDaily(symbol) {
  const apiKey = process.env.FINNHUB_KEY || process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;
  // Finnhub candle requires unix seconds, we fetch last ~300 days
  const to = Math.floor(Date.now() / 1000);
  const from = to - 320 * 24 * 60 * 60;
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.s !== 'ok') return null;
  const candles = j.t.map((t, i) => ({
    t: new Date(t * 1000).toISOString().slice(0, 10),
    open: Number(j.o[i]),
    high: Number(j.h[i]),
    low: Number(j.l[i]),
    close: Number(j.c[i]),
    volume: Number(j.v[i]),
  }));

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] ?? last;
  const changePct = prev?.close ? (last.close - prev.close) / prev.close : 0;

  return {
    provider: 'finnhub',
    as_of: last.t,
    quote: {
      price: last.close,
      change_percent: changePct,
      volume: last.volume,
      currency: null,
    },
    candles,
  };
}

// Yahoo Finance (بدون مفتاح) — غالباً بيانات متأخرة لكنها مجانية وتغطي US + 2222.SR
async function yahooDaily(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d&includePrePost=false&events=div%2Csplits`;
  const r = await fetch(url, { headers: { 'User-Agent': 'MarketSentinel/1.3' } });
  if (!r.ok) return null;
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) return null;

  const meta = res.meta || {};
  const ts = res.timestamp || [];
  const q = res.indicators?.quote?.[0] || {};

  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    const v = q.volume?.[i];
    if ([o, h, l, c].some((x) => typeof x !== 'number')) continue;
    candles.push({
      t: new Date(t * 1000).toISOString().slice(0, 10),
      open: Number(o),
      high: Number(h),
      low: Number(l),
      close: Number(c),
      volume: typeof v === 'number' ? Number(v) : null,
    });
  }
  if (!candles.length) return null;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] ?? last;

  const price = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : last.close;
  const prevClose = typeof meta.previousClose === 'number' ? meta.previousClose : prev.close;
  const change = prevClose != null ? (price - prevClose) : null;
  const changePct = (change != null && prevClose) ? (change / prevClose) : 0;

  return {
    provider: 'yahoo_free',
    as_of: last.t,
    quote: {
      price,
      change_percent: changePct,
      volume: last.volume,
      currency: meta.currency || null,
    },
    candles,
    fundamentals: null,
    sentiment: null,
  };
}

async function yahooFundamentals(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics%2CfinancialData`;
    const r = await fetch(url, { headers: { 'User-Agent': 'MarketSentinel/1.3' } });
    if (!r.ok) return null;
    const j = await r.json();
    const s = j?.quoteSummary?.result?.[0];
    if (!s) return null;

    const ks = s.defaultKeyStatistics || {};
    const fd = s.financialData || {};
    const pe = ks?.trailingPE?.raw ?? ks?.forwardPE?.raw ?? null;
    const debt_equity = fd?.debtToEquity?.raw ?? null;
    const roe = fd?.returnOnEquity?.raw != null ? (fd.returnOnEquity.raw * 100) : null;
    const operating_margin = fd?.operatingMargins?.raw != null ? (fd.operatingMargins.raw * 100) : null;
    return { pe, debt_equity, roe, operating_margin };
  } catch (_) {
    return null;
  }
}

export async function getMarketData({ symbol, market, tf = 'D', provider = null, mode = null }) {
  const envProvider = (process.env.STOCK_PROVIDER || '').toLowerCase();
  const reqProvider = (provider || '').toString().trim().toLowerCase();
  const reqMode = (mode || '').toString().trim().toLowerCase();
  const effectiveMode = (reqMode === 'pro' || reqMode === 'paid') ? 'pro' : 'free';
  // In FREE mode we only allow free/demo providers.
  const allowPaid = effectiveMode === 'pro';
  const providerRaw = reqProvider || envProvider;
  const providerEff = (!allowPaid && ['finnhub_paid','eodhd_paid'].includes(providerRaw)) ? 'yahoo_free' : providerRaw;
  const providerName = providerEff;
  const sym = normalizeSymbol(symbol, market);

  // SAHMK quote overlay for Saudi symbols (adds quote without changing candle provider)
  let sahmk_overlay = null;
  try {
    if (isSaudiSymbol(sym, market)) {
      sahmk_overlay = await sahmkQuote(sym);
    }
  } catch (_) {
    sahmk_overlay = null;
  }
  const cacheKey = `${effectiveMode}:${providerName}:${market}:${tf}:${sym}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let out = null;
  try {
    // Back-compat aliases
    const p0 = providerName === 'yahoo' ? 'yahoo_free'
      : providerName === 'finnhub' ? 'finnhub_paid'
      : providerName === 'alphavantage' ? 'alphavantage_free'
      : providerName;

    // Enforce mode tiers
    const paidKeys = {
      finnhub_paid: !!String(process.env.FINNHUB_KEY || process.env.FINNHUB_API_KEY || '').trim(),
      eodhd_paid: !!String(process.env.EODHD_KEY || process.env.EOD_HISTORICAL_DATA_KEY || '').trim(),
      alphavantage_free: !!String(process.env.ALPHA_VANTAGE_KEY || process.env.ALPHAVANTAGE_API_KEY || '').trim(),
    };

    let p = p0;
    if (effectiveMode !== 'pro') {
      if (p === 'finnhub_paid' || p === 'eodhd_paid') p = 'yahoo_free';
    } else {
      // In PRO mode, if key is missing, gracefully fall back to Yahoo.
      if ((p === 'finnhub_paid' && !paidKeys.finnhub_paid) || (p === 'eodhd_paid' && !paidKeys.eodhd_paid)) {
        p = 'yahoo_free';
      }
    }


    // SAHMK (Saudi) daily history provider (optional)
    if (!out && (p === 'sahmk' || p === 'shmk') && tf === 'D' && isSaudiSymbol(sym, market)) {
      const sh = await sahmkHistory(sym);
      if (sh && sh.candles && sh.candles.length) {
        out = sh;
        out.providerName = 'sahmk';
      }
    }

    if (p === 'yahoo_free') {
      out = await yahooDaily(sym);
      if (out && !out.fundamentals) out.fundamentals = await yahooFundamentals(sym);
    } else if (p === 'finnhub_paid') out = await finnhubDaily(sym);
    else if (p === 'eodhd_paid') out = await eodhdDaily(sym);
    else if (p === 'alphavantage_free') out = await alphavantageDaily(sym);
    else {
      // auto: prefer Yahoo (free). In PRO mode for SA, try EODHD before other paid US providers.
      out = (await yahooDaily(sym)) || ((effectiveMode==='pro' && market==='SA') ? (await eodhdDaily(sym)) : null) || (await finnhubDaily(sym)) || (await alphavantageDaily(sym));
      if (out?.providerName === 'yahoo_free' && !out.fundamentals) out.fundamentals = await yahooFundamentals(sym);
    }
  

    // Provider Failover: إذا فشل مزود PRO (rate limit / 5xx / no data) نحاول FREE تلقائيًا
    // ونحافظ على استمرارية /api/analyze بدون توقف.
    if (!out && effectiveMode === 'pro' && (p === 'finnhub_paid' || p === 'eodhd_paid')) {
      try {
        const fb = await yahooDaily(sym);
        if (fb) {
          fb.failover_from = p;
          fb.integrity_flags = Array.isArray(fb.integrity_flags) ? fb.integrity_flags : [];
          fb.integrity_flags.push('PROVIDER_FAILOVER_TO_FREE');
          out = fb;
          if (out && !out.fundamentals) out.fundamentals = await yahooFundamentals(sym);
        }
      } catch (_) {
        // ignore
      }
    }
} catch (e) {
    // ignore
  }

  if (out && !out.data_source) {
    out.data_source = out.providerName || providerName || 'demo';
  }
  if (out && !out.latency_note) {
    // Yahoo endpoints are often delayed/EOD. Others may be intraday depending on plan, but we keep conservative labels.
    if (String(out.providerName).includes('yahoo')) out.latency_note = 'Delayed/EOD';
    else if (String(out.providerName).includes('eodhd')) out.latency_note = 'EOD';
    else out.latency_note = (effectiveMode==='pro' ? 'Provider' : 'Delayed');
  }

  // v1.8: Intraday + Quarterly (اختياري)
  const intradayDisabled = String(process.env.INTRADAY_DISABLED || '').trim() === '1';
  // Intraday is fetched only when PRO (or when explicitly requested via tf=1M/5M)
  const tfKey = String(tf || 'D').toUpperCase();
  const intradayRequested = (tfKey === '1M' || tfKey === '5M' || tfKey === 'INTRADAY');
  const intradayWanted = (!intradayDisabled) && (effectiveMode === 'pro' || intradayRequested);

  let intraday = null;
  if (intradayWanted) {
    try {
      const yahooInterval = (tfKey === '1M') ? '1m' : String(process.env.YAHOO_INTRADAY_INTERVAL || '5m');
      const finnhubRes = (tfKey === '1M') ? '1' : String(process.env.INTRADAY_RESOLUTION || '5');
      const avInterval = (tfKey === '1M') ? '1min' : String(process.env.INTRADAY_INTERVAL || '5min');

      if (out?.providerName === 'finnhub') intraday = await finnhubIntraday(sym, finnhubRes);
      else if (out?.providerName === 'alphavantage') intraday = await alphavantageIntraday(sym, avInterval);

      if (!intraday) intraday = await yahooIntraday(sym, yahooInterval);
    } catch (_) {
      intraday = null;
    }
  }

  let quarterly = null;
  try {
    quarterly = await yahooQuarterly(sym);
  } catch (_) {
    quarterly = null;
  }

  const val = out || {
    providerName: providerName || 'demo',
    data_source: providerName || 'demo',
    latency_note: effectiveMode === 'pro' ? 'Provider' : 'Delayed/EOD',
    as_of: new Date().toISOString(),
    quote: null,
    candles: [],
    fundamentals: null,
    sentiment: null,
  };

  val.mode = effectiveMode;

  // SAHMK overlay apply (quote only)
  if (sahmk_overlay && sahmk_overlay.quote) {
    if (!val.quote) val.quote = sahmk_overlay.quote;
    // Keep original providerName for candles, but annotate source if in demo
    if (!val.providerName || val.providerName === 'demo') {
      val.providerName = 'sahmk';
      val.data_source = 'sahmk';
      val.latency_note = sahmk_overlay.latency_note || val.latency_note;
    }
  }

  val.intraday = intraday || null;
  val.quarterly = quarterly || null;

  cacheSet(cacheKey, val, 30_000);
  return val;
}
