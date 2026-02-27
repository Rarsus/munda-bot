import { Pool, PoolClient } from 'pg';
import { logger } from './logger';
import { Database } from './database/index';

let pool: Pool;
let db: Database;

export function initializeDatabase(databaseUrl: string): Pool {
  pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    logger.error('Unexpected error on idle client', {
      service: 'Database',
      error: err,
    });
  });

  // Initialize database repositories
  db = new Database(pool);

  return pool;
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
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
    logger.error('Database query error', {
      service: 'Database',
      query: text,
      error,
    });
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
    logger.info('Database connection closed', { service: 'Database' });
  }
}

export default {
  initializeDatabase,
  getClient,
  query,
  queryOne,
  closeDatabase,
};
