// server/sectorHeatmap.js (ESM)
import { getMarketData } from './marketData.js';
import { getSectorDefs } from './sectorConfig.js';

function safePct(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function calcRegime(changePct) {
  const c = safePct(changePct);
  if (!Number.isFinite(c)) return 'UNKNOWN';
  if (c >= 1) return 'UPTREND';
  if (c <= -1) return 'DOWNTREND';
  return 'RANGE';
}

async function fetchChangePct({ symbol, market, tf, provider, mode }) {
  const d = await getMarketData({ symbol, market, tf, provider, mode });
  // normalize across providers
  const ch = safePct(d?.quote?.changePercent ?? d?.quote?.change_pct ?? d?.change_pct);
  return ch;
}

export async function computeSectorHeatmap({ market, tf = 'D', provider = 'yahoo_free', mode = 'free' }) {
  const defs = getSectorDefs(market);
  const sectors = [];

  for (const def of defs) {
    const changes = [];
    for (const sym of (def.symbols || [])) {
      try {
        const ch = await fetchChangePct({ symbol: sym, market, tf, provider, mode });
        if (Number.isFinite(ch)) changes.push(ch);
      } catch (_) {}
    }
    const avg = changes.length ? (changes.reduce((a,b)=>a+b,0) / changes.length) : null;
    sectors.push({
      sector: def.sector,
      change_pct: avg !== null ? Number(avg.toFixed(2)) : null,
      regime: calcRegime(avg),
      sample_count: changes.length,
    });
  }

  // sort by performance desc (best to worst)
  sectors.sort((a,b) => (Number(b.change_pct??-999)-Number(a.change_pct??-999)));

  return {
    ok: true,
    market: String(market || '').toUpperCase(),
    tf,
    sectors: sectors.map(s => ({ sector: s.sector, change_pct: s.change_pct, regime: s.regime })),
    meta: { samples: sectors.reduce((n,s)=>n+(s.sample_count||0),0) },
    updated_at: new Date().toISOString(),
  };
}
