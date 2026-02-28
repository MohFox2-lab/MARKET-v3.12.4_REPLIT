import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { getPool } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const pool = getPool();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('✅ schema.sql applied');

  // Call demo seed endpoint logic directly by importing routes helper would be circular.
  // We just insert demo stocks + watchlist minimal.
  const stocks = [
    { symbol: 'AAPL', market: 'US', name: 'Apple Inc.', currency: 'USD' },
    { symbol: '2222.SR', market: 'SA', name: 'أرامكو السعودية', currency: 'SAR' },
    { symbol: 'DUMP', market: 'US', name: 'سهم وهمي (DUMP)', currency: 'USD' }
  ];

  for (const s of stocks) {
    await pool.query(
      `INSERT INTO stocks(symbol, market, name, currency)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(symbol, market) DO UPDATE SET name=EXCLUDED.name, currency=EXCLUDED.currency`,
      [s.symbol, s.market, s.name, s.currency]
    );
  }

  const { rows } = await pool.query('SELECT id, symbol FROM stocks WHERE symbol IN (\'AAPL\',\'2222.SR\',\'DUMP\')');
  for (const r of rows) {
    await pool.query('INSERT INTO watchlist(stock_id) VALUES($1) ON CONFLICT (stock_id) DO NOTHING', [r.id]);
  }

  console.log('✅ Seeded base stocks into DB (AAPL, 2222.SR, DUMP)');
  console.log('ℹ️ For full demo alerts + snapshots, run the app then click "وضع تجريبي" in the UI (or POST /api/demo/seed).');

  await pool.end();
}

main().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});
