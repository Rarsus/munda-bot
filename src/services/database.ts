import { Pool, PoolClient } from 'pg';
import logger from './logger.js';

let pool: Pool;

export function initializeDatabase(databaseUrl: string): Pool {
  pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    logger.error('Unexpected error on idle client', err);
  });

  return pool;
}

export async function getClient(): Promise<PoolClient> {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool.connect();
}

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  
  try {
    const result = await pool.query(text, params);
    return result.rows;
  } catch (error) {
    logger.error('Database query error', { query: text, error });
    throw error;
  }
}

export async function queryOne<T>(text: string, params?: unknown[]): Promise<T | null> {
  const results = await query<T>(text, params);
  return results.length > 0 ? results[0] : null;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    logger.info('Database connection closed');
  }
}

export default {
  initializeDatabase,
  getClient,
  query,
  queryOne,
  closeDatabase,
};
