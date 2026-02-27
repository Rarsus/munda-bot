import { Pool } from 'pg';
import { BaseRepository } from '../BaseRepository';
import { logger } from '../../logger';
import { IGDPRAuditLog, IGDPRAuditLogInput, AuditEventType } from '../../../interfaces/gdpr';

/**
 * GDPR Audit Log repository
 * Tracks all data access, modification, and deletion for compliance
 * Never delete audit logs - retention is required by law
 */
export class GDPRAuditLogRepository extends BaseRepository<IGDPRAuditLog> {
  constructor(pool: Pool) {
    super(pool, 'gdpr_audit_log');
  }

  /**
   * Log an audit event
   */
  async logEvent(input: IGDPRAuditLogInput): Promise<IGDPRAuditLog> {
    try {
      const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const retentionDate = new Date();
      retentionDate.setFullYear(retentionDate.getFullYear() + 3); // 3-year retention

      const result = await this.query(
        `INSERT INTO ${this.tableName} (id, event_type, subject_user_id, requesting_user_id, resource_type, resource_id, guild_id, action, changes, ip_address_hash, user_agent_hash, created_at, retained_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)
         RETURNING *`,
        [
          id,
          input.event_type,
          input.subject_user_id || null,
          input.requesting_user_id || null,
          input.resource_type,
          input.resource_id,
          input.guild_id || null,
          input.action,
          input.changes ? JSON.stringify(input.changes) : null,
          input.ip_address_hash || null,
          input.user_agent_hash || null,
          retentionDate,
        ]
      );
      return result.rows[0];
    } catch (error) {
      logger.error(`Error logging audit event:`, error);
      throw error;
    }
  }

  /**
   * Get audit logs for a specific user
   * Only the user themselves or authorized admins can view
   */
  async getUserAuditLogs(userId: string): Promise<IGDPRAuditLog[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE subject_user_id = $1 OR requesting_user_id = $1 ORDER BY created_at DESC LIMIT 1000`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error getting audit logs for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get guild audit logs
   */
  async getGuildAuditLogs(guildId: string): Promise<IGDPRAuditLog[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 1000`,
        [guildId]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error getting audit logs for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Get logs by event type
   */
  async getLogsByEventType(eventType: AuditEventType): Promise<IGDPRAuditLog[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE event_type = $1 ORDER BY created_at DESC LIMIT 1000`,
        [eventType]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error getting logs for event ${eventType}:`, error);
      throw error;
    }
  }

  /**
   * Get logs for a specific resource
   */
  async getResourceAuditLogs(
    resourceType: 'user' | 'member' | 'guild',
    resourceId: string
  ): Promise<IGDPRAuditLog[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE resource_type = $1 AND resource_id = $2 ORDER BY created_at DESC LIMIT 500`,
        [resourceType, resourceId]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error getting audit logs for ${resourceType} ${resourceId}:`, error);
      throw error;
    }
  }

  /**
   * Export audit logs for user
   * User can export their own data access history
   */
  async exportUserAuditTrail(userId: string): Promise<IGDPRAuditLog[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} 
         WHERE subject_user_id = $1 OR requesting_user_id = $1 
         ORDER BY created_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error exporting audit trail for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Count access attempts for a user
   */
  async countUserAccessAttempts(userId: string): Promise<number> {
    try {
      const result = await this.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM ${this.tableName} 
         WHERE (subject_user_id = $1 OR requesting_user_id = $1) 
         AND event_type LIKE '%ACCESSED%'`,
        [userId]
      );
      return parseInt(result.rows[0]?.count || '0', 10);
    } catch (error) {
      logger.error(`Error counting user access attempts for ${userId}:`, error);
      return 0;
    }
  }

  /**
   * IMPORTANT: Never delete audit logs
   * Audit logs must be retained for legal compliance
   * Only archive to cold storage after retention period
   */
  async archiveOldLogs(beforeDate: Date): Promise<number> {
    try {
      // Just mark as archived instead of deleting
      const result = await this.query(
        `UPDATE ${this.tableName} SET archived = true WHERE created_at < $1 AND archived IS NOT true RETURNING id`,
        [beforeDate]
      );
      const count = result.rows.length;
      logger.info(`Archived ${count} audit logs before ${beforeDate}`);
      return count;
    } catch (error) {
      logger.error(`Error archiving old audit logs:`, error);
      throw error;
    }
  }
}
