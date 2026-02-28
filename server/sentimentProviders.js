/**
 * Sentiment Providers (legal/stable): Manual now, Provider later.
 * No scraping.
 */
export async function getSentiment({ pool, symbol, market, mode = 'manual', manualOverride = null }) {
  const sym = String(symbol || '').trim().toUpperCase();
  const mkt = String(market || 'US').trim().toUpperCase();

  // Manual override (query/manager input)
  if (manualOverride && Number.isFinite(Number(manualOverride.hype_score)) && Number.isFinite(Number(manualOverride.news_severity))) {
    const hype = clampInt(manualOverride.hype_score, 0, 100);
    const sev = clampInt(manualOverride.news_severity, 0, 100);
    return {
      ok: true,
      symbol: sym,
      market: mkt,
      hype_score: hype,
      news_severity: sev,
      sources: ['manual_override'],
      updated_at: new Date().toISOString(),
      source: 'manual',
    };
  }

  // Provider mode placeholder: keep contract stable (upgrade later)
  if (String(mode).toLowerCase() === 'provider') {
    return {
      ok: true,
      symbol: sym,
      market: mkt,
      hype_score: null,
      news_severity: null,
      sources: ['provider_placeholder'],
      updated_at: null,
      source: 'provider',
      note_ar: 'مزود المشاعر غير مفعّل حالياً. استخدم الوضع اليدوي (manual).',
    };
  }

  // Manual stored in DB
  try {
    const q = await pool.query(
      `SELECT hype_score, news_severity, sources, updated_at
       FROM sentiment_manual
       WHERE symbol=$1 AND market=$2`,
      [sym, mkt]
    );
    const row = q.rows?.[0];
    if (!row) {
      return {
        ok: true,
        symbol: sym,
        market: mkt,
        hype_score: null,
        news_severity: null,
        sources: [],
        updated_at: null,
        source: 'manual',
      };
    }
    return {
      ok: true,
      symbol: sym,
      market: mkt,
      hype_score: Number(row.hype_score),
      news_severity: Number(row.news_severity),
      sources: row.sources || ['manual_db'],
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      source: 'manual',
    };
  } catch {
    return { ok: false, error: 'SENTIMENT_DB_ERROR' };
  }
}

export async function setManualSentiment({ pool, symbol, market, hype_score, news_severity, sources = ['manual'] }) {
  const sym = String(symbol || '').trim().toUpperCase();
  const mkt = String(market || 'US').trim().toUpperCase();
  const hype = clampInt(hype_score, 0, 100);
  const sev = clampInt(news_severity, 0, 100);
  const srcs = Array.isArray(sources) ? sources.map(String) : [String(sources || 'manual')];

  const q = await pool.query(
    `INSERT INTO sentiment_manual(symbol, market, hype_score, news_severity, sources)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT(symbol, market)
     DO UPDATE SET hype_score=EXCLUDED.hype_score, news_severity=EXCLUDED.news_severity, sources=EXCLUDED.sources, updated_at=NOW()
     RETURNING symbol, market, hype_score, news_severity, sources, updated_at`,
    [sym, mkt, hype, sev, srcs]
  );
  const row = q.rows?.[0];
  return {
    ok: true,
    symbol: row.symbol,
    market: row.market,
    hype_score: Number(row.hype_score),
    news_severity: Number(row.news_severity),
    sources: row.sources || srcs,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    source: 'manual',
  };
}

function clampInt(x, a, b) {
  const n = Math.round(Number(x));
  if (!Number.isFinite(n)) return a;
  return Math.min(b, Math.max(a, n));
}
