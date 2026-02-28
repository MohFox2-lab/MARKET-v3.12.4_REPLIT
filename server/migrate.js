import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Very small, idempotent "migration" runner.
 * We keep schema in schema.sql and re-apply it at boot (CREATE IF NOT EXISTS + ALTER ... IF NOT EXISTS).
 */
export async function migrate(pool) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // Execute in a single transaction for consistency.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
