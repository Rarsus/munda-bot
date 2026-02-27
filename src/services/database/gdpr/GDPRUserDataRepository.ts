import { Pool } from 'pg';
import { BaseRepository } from '../BaseRepository';
import { logger } from '../../logger';
import {
  IGDPRUserData,
  IGDPRUserDataInput,
  IGDPRUserDataUpdateInput,
} from '../../../interfaces/gdpr';

/**
 * Global user data repository
 * Stores only data directly belonging to user (NOT guild-specific)
 * Data is completely segregated from guild member data
 */
export class GDPRUserDataRepository extends BaseRepository<IGDPRUserData> {
  constructor(pool: Pool) {
    super(pool, 'gdpr_user_data');
  }

  /**
   * Get user by Discord ID
   * Only the user themselves or authorized admins can access
   */
  async getUserById(userId: string): Promise<IGDPRUserData | null> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE user_id = $1 AND deleted_at IS NULL`,
        [userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error getting user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create new user record
   */
  async createUser(input: IGDPRUserDataInput): Promise<IGDPRUserData> {
    try {
      const result = await this.query(
        `INSERT INTO ${this.tableName} (user_id, username, discriminator, email, avatar_url, locale, bio, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING *`,
        [
          input.user_id,
          input.username,
          input.discriminator,
          input.email || null,
          input.avatar_url || null,
          input.locale || null,
          input.bio || null,
        ]
      );
      return result.rows[0];
    } catch (error) {
      logger.error(`Error creating user:`, error);
      throw error;
    }
  }

  /**
   * Update user data
   * Only the user themselves can update their own data
   */
  async updateUser(userId: string, input: IGDPRUserDataUpdateInput): Promise<IGDPRUserData> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (input.username !== undefined) {
        updates.push(`username = $${paramIndex++}`);
        values.push(input.username);
      }
      if (input.email !== undefined) {
        updates.push(`email = $${paramIndex++}`);
        values.push(input.email);
      }
      if (input.avatar_url !== undefined) {
        updates.push(`avatar_url = $${paramIndex++}`);
        values.push(input.avatar_url);
      }
      if (input.locale !== undefined) {
        updates.push(`locale = $${paramIndex++}`);
        values.push(input.locale);
      }
      if (input.bio !== undefined) {
        updates.push(`bio = $${paramIndex++}`);
        values.push(input.bio);
      }

      updates.push(`updated_at = NOW()`);
      values.push(userId);

      const result = await this.query(
        `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE user_id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
        values
      );

      if (!result.rows[0]) {
        throw new Error(`User ${userId} not found`);
      }

      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Soft delete user data (GDPR "right to be forgotten")
   * Marks as deleted but retains audit trail
   */
  async softDeleteUser(userId: string): Promise<void> {
    try {
      await this.query(
        `UPDATE ${this.tableName} SET deleted_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );
      logger.info(`Soft deleted user ${userId}`);
    } catch (error) {
      logger.error(`Error soft deleting user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Permanently delete user data
   * Only after validation and audit trail is complete
   */
  async permanentlyDeleteUser(userId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Delete user data
      await client.query(`DELETE FROM ${this.tableName} WHERE user_id = $1`, [userId]);

      await client.query('COMMIT');
      logger.warn(`Permanently deleted user ${userId} data`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error permanently deleting user ${userId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all users (admin only)
   */
  async getAllUsers(limit = 100, offset = 0): Promise<IGDPRUserData[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE deleted_at IS NULL LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error getting all users:`, error);
      throw error;
    }
  }
}
