-- MARKET_SENTINEL_AR v1.0.0
-- Minimal schema for Postgres

CREATE TABLE IF NOT EXISTS stocks (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US','SA')),
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_snapshots (
  id SERIAL PRIMARY KEY,
  stock_id INT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  as_of TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price NUMERIC(18,6) NOT NULL,
  change_percent NUMERIC(10,4) NOT NULL,
  volume BIGINT NOT NULL,
  avg_volume20d BIGINT NOT NULL,
  rsi14 NUMERIC(10,4) NOT NULL,
  sma20 NUMERIC(18,6) NOT NULL,
  sma50 NUMERIC(18,6),
  sma200 NUMERIC(18,6) NOT NULL,
  ema20 NUMERIC(18,6),
  atr14 NUMERIC(18,6),
  bb_upper NUMERIC(18,6),
  bb_lower NUMERIC(18,6),
  macd NUMERIC(18,6),
  macd_signal NUMERIC(18,6),
  macd_hist NUMERIC(18,6),
  vol_ratio20 NUMERIC(10,4) NOT NULL,
  pe NUMERIC(12,4),
  debt_equity NUMERIC(12,4),
  roe NUMERIC(12,4),
  op_margin NUMERIC(12,4),
  trust_score INT NOT NULL,
  traffic TEXT NOT NULL CHECK (traffic IN ('GREEN','YELLOW','RED')),
  tech_score INT,
  fund_score INT,
  sent_score INT
);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  stock_id INT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  snapshot_id INT REFERENCES stock_snapshots(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  code TEXT NOT NULL CHECK (code IN ('A01','A02','A03','A04','A05','A06','A07')),
  severity TEXT NOT NULL CHECK (severity IN ('HIGH','MED','LOW')),
  title_ar TEXT NOT NULL,
  message_ar TEXT NOT NULL
);

-- If alerts table already exists from older versions, widen allowed codes.
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_code_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_code_check CHECK (code IN ('A01','A02','A03','A04','A05','A06','A07'));

-- v1.6 additions (Smart Money + Institutional layer)
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS smf_available BOOLEAN;
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS smf_score INT;
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS smf_signal TEXT;

ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS institutional_score INT;
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS institutional_signal TEXT;

-- v1.8 additions (Institutional Flow details + Earnings Growth Trend)
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS institutional_vwap NUMERIC(18,6);
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS institutional_delta NUMERIC(10,6);
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS earnings_growth_score INT;
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS earnings_growth_signal TEXT;

ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS sector_valuation TEXT;
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS earnings_quality_score INT;
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS volume_anomaly_score INT;
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS volume_anomaly_flag TEXT;

CREATE TABLE IF NOT EXISTS sector_benchmarks (
  id SERIAL PRIMARY KEY,
  market TEXT NOT NULL CHECK (market IN ('US','SA')),
  sector TEXT NOT NULL,
  pe NUMERIC(12,4) NOT NULL,
  roe NUMERIC(12,4),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(market, sector)
);

-- Watchlist (simple)
CREATE TABLE IF NOT EXISTS watchlist (
  id SERIAL PRIMARY KEY,
  stock_id INT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stock_id)
);

-- Global settings (v1.2+)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- App settings (v1.3+ preferred)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade helpers (safe when re-running)
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS sma50 NUMERIC(18,6);
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS ema20 NUMERIC(18,6);
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS atr14 NUMERIC(18,6);
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS bb_upper NUMERIC(18,6);
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS bb_lower NUMERIC(18,6);
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS macd NUMERIC(18,6);
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS macd_signal NUMERIC(18,6);
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS macd_hist NUMERIC(18,6);
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS tech_score INT;
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS fund_score INT;
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS sent_score INT;


-- ---- Migration safety: ensure unique(symbol, market) and remove old unique(symbol) if present
DO $$
BEGIN
  -- Drop old default unique constraint on symbol if it exists (created by UNIQUE on symbol)
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stocks_symbol_key'
  ) THEN
    ALTER TABLE stocks DROP CONSTRAINT stocks_symbol_key;
  END IF;

  -- Create new unique constraint if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stocks_symbol_market_key'
  ) THEN
    ALTER TABLE stocks ADD CONSTRAINT stocks_symbol_market_key UNIQUE (symbol, market);
  END IF;
END $$;


-- v3.4 Snapshotting Engine (decision history)
CREATE TABLE IF NOT EXISTS analysis_snapshots (
  id SERIAL PRIMARY KEY,
  stock_id INT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  tf TEXT NOT NULL CHECK (tf IN ('D','W')),
  as_of DATE NOT NULL DEFAULT (NOW()::DATE),
  price NUMERIC(18,6),
  trust_score INT,
  traffic TEXT CHECK (traffic IN ('GREEN','YELLOW','RED')),
  regime TEXT,
  trend_confirmed BOOLEAN,
  confidence TEXT,
  pattern_key TEXT,
  rs_delta_pct NUMERIC(10,4),
  rs_label TEXT,
  sector_delta_pct NUMERIC(10,4),
  sector_label TEXT,
  alerts JSONB,
  clusters JSONB,
  assistant JSONB,
  reasons JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stock_id, tf, as_of)
);

CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_stock_tf_asof ON analysis_snapshots(stock_id, tf, as_of);
CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_pattern ON analysis_snapshots(pattern_key);



-- v3.4.2 Snapshot Intelligence + Decision Backtester (journal)
CREATE TABLE IF NOT EXISTS decision_journal (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symbol TEXT NOT NULL,
  market TEXT NOT NULL,
  tf TEXT NOT NULL DEFAULT 'D' CHECK (tf IN ('D','W')),
  traffic TEXT CHECK (traffic IN ('GREEN','YELLOW','RED')),
  trust_score INT,
  confidence TEXT,
  regime TEXT,
  trend_confirmed BOOLEAN,
  alerts_json JSONB,
  clusters_json JSONB,
  assistant_json JSONB,
  entry_price NUMERIC(18,6),
  check_after_days INT NOT NULL DEFAULT 5,
  checked_at TIMESTAMPTZ NULL,
  future_price NUMERIC(18,6) NULL,
  future_change_pct NUMERIC(10,4) NULL,
  outcome_label TEXT NULL CHECK (outcome_label IN ('OK','BAD','NEUTRAL')),
  notes TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_journal_created_at ON decision_journal(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_journal_symbol_market ON decision_journal(symbol, market);
CREATE INDEX IF NOT EXISTS idx_decision_journal_outcome ON decision_journal(outcome_label);



-- v3.4.3 — A04 Sentiment (Manual + Provider Adapter placeholder)
CREATE TABLE IF NOT EXISTS sentiment_manual (
  symbol TEXT NOT NULL,
  market TEXT NOT NULL,
  hype_score INT NOT NULL CHECK (hype_score BETWEEN 0 AND 100),
  news_severity INT NOT NULL CHECK (news_severity BETWEEN 0 AND 100),
  sources TEXT[] NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, market)
);



-- v3.5.0 — Data Integrity Engine / Provider Failover / Freshness-aware Confidence
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='stock_snapshots' AND column_name='data_quality_json'
  ) THEN
    ALTER TABLE stock_snapshots ADD COLUMN data_quality_json JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='decision_journal' AND column_name='data_quality_json'
  ) THEN
    ALTER TABLE decision_journal ADD COLUMN data_quality_json JSONB;
  END IF;
END $$;



-- v3.10.0 Data Housekeeping — Monthly Summary
CREATE TABLE IF NOT EXISTS monthly_performance_summary (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  market TEXT NOT NULL,
  month TEXT NOT NULL, -- YYYY-MM
  avg_trust_score NUMERIC(10,4),
  avg_confidence NUMERIC(10,4),
  c01_count INT NOT NULL DEFAULT 0,
  a01_count INT NOT NULL DEFAULT 0,
  red_count INT NOT NULL DEFAULT 0,
  accuracy_rate NUMERIC(10,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(symbol, market, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_summary_symbol_month ON monthly_performance_summary(symbol, month);

CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_stock_created ON analysis_snapshots(stock_id, created_at);

CREATE INDEX IF NOT EXISTS idx_alerts_stock_created ON alerts(stock_id, created_at);

CREATE INDEX IF NOT EXISTS idx_decision_journal_symbol_created ON decision_journal(symbol, created_at);
