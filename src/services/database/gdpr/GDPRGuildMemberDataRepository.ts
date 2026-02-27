import { Pool } from 'pg';
import { BaseRepository } from '../BaseRepository';
import { logger } from '../../logger';
import {
  IGDPRGuildMemberData,
  IGDPRGuildMemberDataInput,
  IGDPRGuildMemberDataUpdateInput,
} from '../../../interfaces/gdpr';

/**
 * Guild member data repository
 * Stores member data segregated by guild
 * Complete separation from global user data
 * Each guild owns its member records
 */
export class GDPRGuildMemberDataRepository extends BaseRepository<IGDPRGuildMemberData> {
  constructor(pool: Pool) {
    super(pool, 'gdpr_guild_member_data');
  }

  /**
   * Get member data by guild and user ID
   * User can access their own member data for a guild
   * Guild can access all member data in their guild
   */
  async getMemberInGuild(
    guildId: string,
    userId: string
  ): Promise<IGDPRGuildMemberData | null> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE guild_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [guildId, userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error(
        `Error getting member ${userId} in guild ${guildId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get all members in a guild
   */
  async getGuildMembers(guildId: string): Promise<IGDPRGuildMemberData[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE guild_id = $1 AND deleted_at IS NULL`,
        [guildId]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error getting members for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Get all guilds a user is member of
   */
  async getUserGuildMemberships(userId: string): Promise<IGDPRGuildMemberData[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE user_id = $1 AND deleted_at IS NULL`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error getting guild memberships for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create member record
   */
  async createMember(
    input: IGDPRGuildMemberDataInput
  ): Promise<IGDPRGuildMemberData> {
    try {
      const result = await this.query(
        `INSERT INTO ${this.tableName} (guild_id, user_id, joined_at, roles, nick, mute, deaf, pending, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING *`,
        [
          input.guild_id,
          input.user_id,
          input.joined_at,
          JSON.stringify(input.roles || []),
          input.nick || null,
          input.mute || false,
          input.deaf || false,
          false,
        ]
      );
      return result.rows[0];
    } catch (error) {
      logger.error(
        `Error creating member ${input.user_id} in guild ${input.guild_id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Update member data
   */
  async updateMember(
    guildId: string,
    userId: string,
    input: IGDPRGuildMemberDataUpdateInput
  ): Promise<IGDPRGuildMemberData> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (input.roles !== undefined) {
        updates.push(`roles = $${paramIndex++}`);
        values.push(JSON.stringify(input.roles));
      }
      if (input.nick !== undefined) {
        updates.push(`nick = $${paramIndex++}`);
        values.push(input.nick);
      }
      if (input.mute !== undefined) {
        updates.push(`mute = $${paramIndex++}`);
        values.push(input.mute);
      }
      if (input.deaf !== undefined) {
        updates.push(`deaf = $${paramIndex++}`);
        values.push(input.deaf);
      }
      if (input.timed_out_until !== undefined) {
        updates.push(`timed_out_until = $${paramIndex++}`);
        values.push(input.timed_out_until);
      }

      updates.push(`updated_at = NOW()`);
      values.push(guildId);
      values.push(userId);

      const result = await this.query(
        `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE guild_id = $${paramIndex++} AND user_id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
        values
      );

      if (!result.rows[0]) {
        throw new Error(
          `Member ${userId} not found in guild ${guildId}`
        );
      }

      return result.rows[0];
    } catch (error) {
      logger.error(
        `Error updating member ${userId} in guild ${guildId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Soft delete member record (when user leaves or is removed from guild)
   */
  async softDeleteMember(guildId: string, userId: string): Promise<void> {
    try {
      await this.query(
        `UPDATE ${this.tableName} SET deleted_at = NOW(), updated_at = NOW() WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
      );
      logger.info(`Soft deleted member ${userId} from guild ${guildId}`);
    } catch (error) {
      logger.error(
        `Error soft deleting member ${userId} from guild ${guildId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Delete all member records for a user across all guilds
   * Used when user requests data erasure
   */
  async deleteUserFromAllGuilds(userId: string): Promise<number> {
    try {
      const result = await this.query(
        `UPDATE ${this.tableName} SET deleted_at = NOW(), updated_at = NOW() WHERE user_id = $1 RETURNING id`,
        [userId]
      );
      const count = result.rows.length;
      logger.info(`Deleted ${count} guild member records for user ${userId}`);
      return count;
    } catch (error) {
      logger.error(`Error deleting user ${userId} from all guilds:`, error);
      throw error;
    }
  }

  /**
   * Permanently delete member records
   */
  async permanentlyDeleteGuildMembers(
    guildId: string,
    userIds: string[]
  ): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `DELETE FROM ${this.tableName} WHERE guild_id = $1 AND user_id = ANY($2)`,
        [guildId, userIds]
      );

      await client.query('COMMIT');
      logger.warn(
        `Permanently deleted ${result.rowCount} members from guild ${guildId}`
      );
      return result.rowCount || 0;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error permanently deleting guild members:`, error);
      throw error;
    } finally {
      client.release();
    }
  }
}
