export const API = {
  async health() {
    return fetchJson('/api/health');
  },
  async listWatchlist() {
    return fetchJson('/api/watchlist');
  },
  async portfolioHealth() {
    return fetchJson('/api/portfolio/health');
  },
  async addWatch(symbol, market) {
    return fetchJson('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, market })
    });
  },
  async analyze(symbol, market, extra = {}) {
    const q = new URLSearchParams({ symbol, market, tf: 'D', ...extra });
    return fetchJson(`/api/analyze?${q.toString()}`);
  },
  async scan(symbolOrCode, extra = {}) {
    const q = new URLSearchParams({ symbol: String(symbolOrCode || '').trim(), tf: 'D', ...extra });
    return fetchJson(`/api/scan?${q.toString()}`);
  },
  async listAlerts(stockId) {
    const q = stockId ? `?stockId=${encodeURIComponent(stockId)}` : '';
    return fetchJson(`/api/alerts${q}`);
  },
  async listSnapshots(stockId, limit = 30) {
    const q = new URLSearchParams({ stockId: String(stockId), limit: String(limit) });
    return fetchJson(`/api/snapshots?${q.toString()}`);
  },
  async demoSeed() {
    return fetchJson('/api/demo/seed', { method: 'POST' });
  },
  async providers() {
    return fetchJson('/api/providers');
  },
  async activeUsers() {
    return fetchJson('/api/active-users');
  },
    async sectorHeatmap(market='US', tf='D') {
    const q = new URLSearchParams({ market, tf });
    return fetchJson(`/api/sector/heatmap?${q.toString()}`);
  },
async settings() {
    return fetchJson('/api/settings');
  },
  async saveSettings(settings) {
    return fetchJson('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings || {})
    });
  }
};

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (data && data.message) ? data.message : (typeof data === 'string' ? data : 'Request failed');
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
