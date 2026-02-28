// server/crossMarketMap.js  (ESM)
// Cross-market references & benchmarks used by Correlation Guard (A08)

export const CROSS_MARKET_MAP = {
  // Saudi examples
  "2222.SR": ["CL=F", "BZ=F"],     // Aramco ↔ Oil
  "TECH_SA": ["^IXIC"],            // Tech SA basket (virtual) ↔ Nasdaq

  // US examples
  "AAPL": ["^IXIC", "^GSPC"],      // Apple ↔ Nasdaq/S&P
  "TSLA": ["^IXIC"],
};

// Benchmarks per market (primary first)
export const DEFAULT_BENCHMARKS = {
  US: ["^GSPC", "^IXIC"],
  SA: ["^TASI"],
};

// If no mapping exists, fallback refs (light)
export const DEFAULT_REFS = {
  US: ["^GSPC", "^IXIC"],
  SA: ["^TASI", "^GSPC", "^IXIC"],
};

export function resolveRefs({ symbol, market }) {
  const s = String(symbol || "").trim().toUpperCase();
  const m = String(market || "").trim().toUpperCase();
  if (CROSS_MARKET_MAP[s]) return CROSS_MARKET_MAP[s];
  return DEFAULT_REFS[m] || [];
}
