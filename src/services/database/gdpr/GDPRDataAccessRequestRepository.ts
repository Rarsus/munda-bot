import { Pool } from 'pg';
import { BaseRepository } from '../BaseRepository';
import { logger } from '../../logger';
import {
  IGDPRDataAccessRequest,
  IGDPRDataAccessRequestInput,
  IGDPRErasureRequest,
  IGDPRErasureRequestInput,
} from '../../../interfaces/gdpr';

/**
 * Data Access Requests Repository
 * Handles user requests for data access, portability, and erasure
 * Supports "Right to Data Portability" and "Right to be Forgotten"
 */
export class GDPRDataAccessRequestRepository extends BaseRepository<IGDPRDataAccessRequest> {
  constructor(pool: Pool) {
    super(pool, 'gdpr_data_access_request');
  }

  /**
   * Get a specific request
   */
  async getRequest(requestId: string): Promise<IGDPRDataAccessRequest | null> {
    try {
      const result = await this.query(`SELECT * FROM ${this.tableName} WHERE id = $1`, [requestId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error getting request ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Create new data access request
   */
  async createRequest(input: IGDPRDataAccessRequestInput): Promise<IGDPRDataAccessRequest> {
    try {
      const id = `dar_${input.user_id}_${Date.now()}`;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30-day window for compliance

      const result = await this.query(
        `INSERT INTO ${this.tableName} (id, user_id, request_type, status, data_format, requested_at, expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW(), NOW())
         RETURNING *`,
        [id, input.user_id, input.request_type, 'pending', input.data_format || 'json', expiresAt]
      );
      return result.rows[0];
    } catch (error) {
      logger.error(`Error creating data access request:`, error);
      throw error;
    }
  }

  /**
   * Get pending requests for a user
   */
  async getUserPendingRequests(userId: string): Promise<IGDPRDataAccessRequest[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE user_id = $1 AND status IN ('pending', 'in_progress') ORDER BY requested_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error getting pending requests for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update request status
   */
  async updateRequestStatus(
    requestId: string,
    status: string,
    downloadUrl?: string
  ): Promise<IGDPRDataAccessRequest> {
    try {
      const updates = ['status = $1', 'updated_at = NOW()'];
      const values: any[] = [status];
      let paramIndex = 2;

      if (downloadUrl) {
        updates.push(`download_url = $${paramIndex++}`);
        values.push(downloadUrl);
      }

      if (status === 'completed') {
        updates.push(`completed_at = NOW()`);
      }

      values.push(requestId);

      const result = await this.query(
        `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      if (!result.rows[0]) {
        throw new Error(`Request ${requestId} not found`);
      }

      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating request ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up expired requests
   */
  async cleanupExpiredRequests(): Promise<number> {
    try {
      const result = await this.query(
        `DELETE FROM ${this.tableName} WHERE expires_at < NOW() AND status NOT IN ('completed')`
      );
      logger.info(`Cleaned up ${result.rowCount} expired requests`);
      return result.rowCount || 0;
    } catch (error) {
      logger.error(`Error cleaning up expired requests:`, error);
      throw error;
    }
  }
}

/**
 * Erasure Requests Repository
 * Handles user requests for data deletion (GDPR "right to be forgotten")
 */
export class GDPRErasureRequestRepository extends BaseRepository<IGDPRErasureRequest> {
  constructor(pool: Pool) {
    super(pool, 'gdpr_erasure_request');
  }

  /**
   * Create new erasure request
   */
  async createErasureRequest(input: IGDPRErasureRequestInput): Promise<IGDPRErasureRequest> {
    try {
      const id = `erasure_${input.user_id}_${Date.now()}`;

      const result = await this.query(
        `INSERT INTO ${this.tableName} (id, user_id, status, reason, delete_user_data, delete_guild_memberships, delete_consents, delete_audit_logs, requested_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
         RETURNING *`,
        [
          id,
          input.user_id,
          'pending',
          input.reason || null,
          input.delete_user_data !== false,
          input.delete_guild_memberships !== false,
          input.delete_consents !== false,
          input.delete_audit_logs === true, // Audit logs are NOT deleted by default
        ]
      );
      return result.rows[0];
    } catch (error) {
      logger.error(`Error creating erasure request:`, error);
      throw error;
    }
  }

  /**
   * Get erasure requests for user
   */
  async getUserErasureRequests(userId: string): Promise<IGDPRErasureRequest[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE user_id = $1 ORDER BY requested_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error getting erasure requests for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get pending erasure requests
   */
  async getPendingErasureRequests(): Promise<IGDPRErasureRequest[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE status = 'pending' ORDER BY requested_at ASC`
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error getting pending erasure requests:`, error);
      throw error;
    }
  }

  /**
   * Update erasure request status
   */
  async updateErasureStatus(
    requestId: string,
    status: string,
    deletionsCount?: number
  ): Promise<IGDPRErasureRequest> {
    try {
      const updates = ['status = $1', 'updated_at = NOW()'];
      const values: any[] = [status];
      let paramIndex = 2;

      if (deletionsCount !== undefined) {
        updates.push(`deletions_count = $${paramIndex++}`);
        values.push(deletionsCount);
      }

      if (status === 'completed') {
        updates.push(`completed_at = NOW()`);
      }

      values.push(requestId);

      const result = await this.query(
        `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      if (!result.rows[0]) {
        throw new Error(`Erasure request ${requestId} not found`);
      }

      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating erasure request ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Approve erasure request
   */
  async approveErasureRequest(requestId: string, approvedBy: string): Promise<IGDPRErasureRequest> {
    try {
      const result = await this.query(
        `UPDATE ${this.tableName} SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *`,
        [approvedBy, requestId]
      );

      if (!result.rows[0]) {
        throw new Error(`Erasure request ${requestId} not found`);
      }

      return result.rows[0];
    } catch (error) {
      logger.error(`Error approving erasure request ${requestId}:`, error);
      throw error;
    }
  }
}
