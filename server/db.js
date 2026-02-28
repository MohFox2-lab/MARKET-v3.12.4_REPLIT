import pg from 'pg';

const { Pool } = pg;

export function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is missing. Put it in Replit Secrets / environment variables.');
  }
  return new Pool({ connectionString, ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false } });
}

export async function query(pool, text, params = []) {
  const res = await pool.query(text, params);
  return res;
}
