// server/sectorConfig.js (ESM)
// Sector Rotation Heatmap — MVP baskets/ETFs.
// Note: Saudi sector indices may not be available from providers, so we use representative baskets (3–5 symbols).

export const SECTOR_DEFS = {
  US: [
    { sector: 'TECH',        symbols: ['XLK'] },     // or ^NDXT if available
    { sector: 'FINANCIALS',  symbols: ['XLF'] },
    { sector: 'ENERGY',      symbols: ['XLE'] },
    { sector: 'HEALTHCARE',  symbols: ['XLV'] },
  ],
  SA: [
    // Baskets (representative — adjust anytime)
    { sector: 'BANKS',     symbols: ['1120.SR','1180.SR','1010.SR','1050.SR'] },
    { sector: 'ENERGY',    symbols: ['2222.SR','2380.SR'] },
    { sector: 'MATERIALS', symbols: ['2010.SR','1211.SR','3030.SR'] },
  ],
};

export function getSectorDefs(market) {
  const m = String(market || '').toUpperCase();
  return SECTOR_DEFS[m] || [];
}
