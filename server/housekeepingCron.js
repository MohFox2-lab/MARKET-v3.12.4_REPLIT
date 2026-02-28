import crypto from 'crypto';

/**
 * v3.10.0 — Data Housekeeping + Smart Retention
 * هدفه: منع تضخم PostgreSQL بسبب analysis_snapshots و decision_journal.
 *
 * Policy:
 * - Retain detailed analysis_snapshots for SNAPSHOT_RETENTION_DAYS (default 180)
 * - Before deletion: write monthly aggregates into monthly_performance_summary
 * - Optionally retain decision_journal for JOURNAL_RETENTION_DAYS (default 365) for checked entries only
 *
 * No UI changes. Cron only.
 */
export function startHousekeepingCron({ pool }) {
  const enabled = String(process.env.AUTO_HOUSEKEEPING || 'true').toLowerCase() !== 'false';
  if (!enabled) return;

  const retentionDays = Math.max(Number(process.env.SNAPSHOT_RETENTION_DAYS || 180), 30);
  const journalRetentionDays = Math.max(Number(process.env.JOURNAL_RETENTION_DAYS || 365), 0);

  // Run weekly by default (to reduce load), override with HOUSEKEEPING_INTERVAL_HOURS
  const intervalHours = Math.min(Math.max(Number(process.env.HOUSEKEEPING_INTERVAL_HOURS || 168), 6), 24 * 30);

  async function upsertMonthlySummary(rows) {
    if (!rows || !rows.length) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const r of rows) {
        await client.query(
          `INSERT INTO monthly_performance_summary
            (symbol, market, month, avg_trust_score, avg_confidence, c01_count, a01_count, red_count, accuracy_rate, updated_at)
           VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
           ON CONFLICT (symbol, market, month)
           DO UPDATE SET
             avg_trust_score = EXCLUDED.avg_trust_score,
             avg_confidence = EXCLUDED.avg_confidence,
             c01_count = EXCLUDED.c01_count,
             a01_count = EXCLUDED.a01_count,
             red_count = EXCLUDED.red_count,
             accuracy_rate = COALESCE(EXCLUDED.accuracy_rate, monthly_performance_summary.accuracy_rate),
             updated_at = NOW()`,
          [
            r.symbol,
            r.market,
            r.month,
            r.avg_trust_score,
            r.avg_confidence,
            r.c01_count,
            r.a01_count,
            r.red_count,
            r.accuracy_rate,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async function runOnce() {
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    const cutoffIso = cutoff.toISOString();

    // 1) Aggregate old snapshots into monthly summary
    // Notes:
    // - analysis_snapshots uses stock_id; join with stocks to get symbol/market.
    // - clusters/alerts are JSONB arrays of objects {code: "..."}.
    // - avg_confidence mapped: HIGH=3 MED=2 LOW=1 else NULL.
    let monthlyRows = [];
    try {
      const q = await pool.query(
        `WITH snap AS (
          SELECT s.symbol, s.market,
                 to_char(date_trunc('month', a.created_at), 'YYYY-MM') AS month,
                 a.trust_score,
                 a.confidence,
                 a.traffic,
                 a.alerts,
                 a.clusters
          FROM analysis_snapshots a
          JOIN stocks s ON s.id = a.stock_id
          WHERE a.created_at < $1
        ),
        agg AS (
          SELECT
            symbol,
            market,
            month,
            AVG(trust_score)::numeric(10,4) AS avg_trust_score,
            AVG(
              CASE UPPER(COALESCE(confidence,'')) 
                WHEN 'HIGH' THEN 3
                WHEN 'MED' THEN 2
                WHEN 'LOW' THEN 1
                ELSE NULL
              END
            )::numeric(10,4) AS avg_confidence,
            SUM(CASE WHEN traffic='RED' THEN 1 ELSE 0 END)::int AS red_count,
            SUM(CASE WHEN jsonb_path_exists(COALESCE(clusters,'[]'::jsonb), '$[*] ? (@.code == "C01")') THEN 1 ELSE 0 END)::int AS c01_count,
            SUM(CASE WHEN jsonb_path_exists(COALESCE(alerts,'[]'::jsonb), '$[*] ? (@.code == "A01")') THEN 1 ELSE 0 END)::int AS a01_count
          FROM snap
          GROUP BY symbol, market, month
        )
        SELECT * FROM agg
        ORDER BY symbol, month`,
        [cutoffIso]
      );
      monthlyRows = q.rows || [];
    } catch (_) {
      monthlyRows = [];
    }

    // 1.1) Add accuracy_rate from decision_journal (if available) for same month
    // Accuracy rate: OK / (OK+BAD) using checked outcomes.
    // We only compute for months present in monthlyRows for efficiency.
    if (monthlyRows.length) {
      const months = Array.from(new Set(monthlyRows.map(r => r.month)));
      const keyset = new Set(monthlyRows.map(r => `${r.symbol}__${r.market}__${r.month}`));

      try {
        const qAcc = await pool.query(
          `SELECT symbol, market,
                  to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
                  SUM(CASE WHEN outcome_label='OK' THEN 1 ELSE 0 END)::int AS ok_count,
                  SUM(CASE WHEN outcome_label='BAD' THEN 1 ELSE 0 END)::int AS bad_count
           FROM decision_journal
           WHERE checked_at IS NOT NULL
             AND to_char(date_trunc('month', created_at), 'YYYY-MM') = ANY($1::text[])
           GROUP BY symbol, market, month`,
          [months]
        );
        const accMap = new Map();
        for (const r of (qAcc.rows || [])) {
          const ok = Number(r.ok_count || 0);
          const bad = Number(r.bad_count || 0);
          const denom = ok + bad;
          const rate = denom > 0 ? (ok / denom) : null;
          accMap.set(`${r.symbol}__${r.market}__${r.month}`, rate);
        }

        monthlyRows = monthlyRows.map(r => {
          const k = `${r.symbol}__${r.market}__${r.month}`;
          if (accMap.has(k)) {
            r.accuracy_rate = accMap.get(k);
          } else {
            r.accuracy_rate = null;
          }
          return r;
        });
      } catch (_) {
        // ignore
      }
    }

    // 2) Upsert monthly summary
    try {
      await upsertMonthlySummary(monthlyRows);
    } catch (_) {
      // do not proceed to delete if summary failed
      return;
    }

    // 3) Delete old detailed snapshots
    try {
      await pool.query(`DELETE FROM analysis_snapshots WHERE created_at < $1`, [cutoffIso]);
    } catch (_) {}

    // 4) Optional: delete old checked journal entries (to prevent unbounded growth)
    if (journalRetentionDays > 0) {
      const jc = new Date(Date.now() - journalRetentionDays * 86400000).toISOString();
      try {
        await pool.query(
          `DELETE FROM decision_journal
           WHERE checked_at IS NOT NULL
             AND created_at < $1`,
          [jc]
        );
      } catch (_) {}
    }

    // 5) Optional maintenance: VACUUM/ANALYZE (keep disabled by default for managed DBs)
    const vacuum = String(process.env.HOUSEKEEPING_VACUUM || 'false').toLowerCase() === 'true';
    if (vacuum) {
      try {
        await pool.query('VACUUM (ANALYZE) analysis_snapshots;');
        await pool.query('VACUUM (ANALYZE) decision_journal;');
        await pool.query('VACUUM (ANALYZE) monthly_performance_summary;');
      } catch (_) {}
    }
  }

  // initial run + interval
  runOnce();
  setInterval(runOnce, intervalHours * 60 * 60 * 1000);
}
