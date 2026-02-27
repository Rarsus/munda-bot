import { Pool, QueryResult, PoolClient, QueryResultRow } from 'pg';
import { logger } from '../logger';

export class BaseRepository<T extends QueryResultRow = any> {
  protected pool: Pool;
  protected tableName: string;

  constructor(pool: Pool, tableName: string) {
    this.pool = pool;
    this.tableName = tableName;
  }

  /**
   * Execute a query
   */
  protected async query<R extends QueryResultRow = T>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<R>> {
    try {
      const result = await this.pool.query<R>(sql, params);
      return result;
    } catch (error) {
      logger.error(`Database query error on ${this.tableName}`, {
        service: 'BaseRepository',
        error,
        sql,
      });
      throw error;
    }
  }

  /**
   * Get single row by ID
   */
  async getById(id: string | number): Promise<T | null> {
    const result = await this.query<T>(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all rows
   */
  async getAll(limit?: number, offset?: number): Promise<T[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: unknown[] = [];

    if (limit) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(limit);
    }

    if (offset) {
      sql += ` OFFSET $${params.length + 1}`;
      params.push(offset);
    }

    const result = await this.query<T>(sql, params);
    return result.rows;
  }

  /**
   * Count all rows
   */
  async count(): Promise<number> {
    const result = await this.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.tableName}`
    );

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Create a new row
   */
  async create(data: Partial<T>): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');

    const sql = `
      INSERT INTO ${this.tableName} (${keys.join(',')})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await this.query<T>(sql, values);
    return result.rows[0];
  }

  /**
   * Update a row
   */
  async update(id: string | number, data: Partial<T>): Promise<T | null> {
    const keys = Object.keys(data);
    if (keys.length === 0) return this.getById(id);

    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(',');
    const values = Object.values(data);
    values.push(id);

    const sql = `
      UPDATE ${this.tableName}
      SET ${setClause}
      WHERE id = $${values.length}
      RETURNING *
    `;

    const result = await this.query<T>(sql, values);
    return result.rows[0] || null;
  }

  /**
   * Delete a row
   */
  async delete(id: string | number): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id]
    );

    return result.rowCount ? result.rowCount > 0 : false;
  }

  /**
   * Execute transaction
   */
  async transaction<R>(
    callback: (client: PoolClient) => Promise<R>
  ): Promise<R> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction failed', {
        service: 'BaseRepository',
        error,
      });
      throw error;
    } finally {
      client.release();
    }
  }
}
