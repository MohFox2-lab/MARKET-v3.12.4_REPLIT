import { getMarketData } from './marketData.js';

/**
 * v3.4.2 — Decision Journal Backtester
 * Runs daily (or on startup) to update unchecked journal entries after N days.
 * No buy/sell recommendations; only evaluates whether risk warnings aligned with reality.
 */
export function startJournalCron({ pool }) {
  const enabled = String(process.env.JOURNAL_CRON || 'true').toLowerCase() !== 'false';
  if (!enabled) return;

  const maxPerRun = Math.min(Math.max(Number(process.env.JOURNAL_MAX_PER_RUN || 50), 5), 500);

  async function runOnce() {
    try {
      const q = await pool.query(
        `SELECT id, symbol, market, tf, traffic, trust_score, entry_price, check_after_days, created_at
         FROM decision_journal
         WHERE checked_at IS NULL
         ORDER BY created_at ASC
         LIMIT $1`,
        [maxPerRun]
      );
      const items = q.rows || [];
      for (const it of items) {
        const createdAt = new Date(it.created_at).getTime();
        const dueAt = createdAt + Number(it.check_after_days || 5) * 86400000;
        if (Date.now() < dueAt) continue;

        const symbol = String(it.symbol);
        const market = String(it.market);
        const tf = String(it.tf || 'D');
        const md = await getMarketData({ symbol, market, tf, mode: process.env.DATA_MODE || 'free' });
        const priceNow = Number(md?.quote?.price ?? md?.quote?.close ?? 0) || null;

        const entry = Number(it.entry_price || 0) || null;
        let changePct = null;
        if (entry && priceNow) changePct = ((priceNow - entry) / entry) * 100;

        // Outcome logic: evaluate if high-risk warning aligned with drop after N days
        const isHighRisk = String(it.traffic || '').toUpperCase() === 'RED';
        const okDrop = (changePct != null && changePct <= -3);
        const strongUp = (changePct != null && changePct >= 3);

        let outcome = 'NEUTRAL';
        if (isHighRisk && okDrop) outcome = 'OK';
        else if (isHighRisk && strongUp) outcome = 'BAD';
        else outcome = 'NEUTRAL';

        await pool.query(
          `UPDATE decision_journal
           SET checked_at = NOW(),
               future_price = $2,
               future_change_pct = $3,
               outcome_label = $4
           WHERE id = $1`,
          [it.id, priceNow, changePct, outcome]
        );
      }
    } catch (_) {
      // silent by design
    }
  }

  // initial run + every 24h
  runOnce();
  setInterval(runOnce, 24 * 60 * 60 * 1000);
}
