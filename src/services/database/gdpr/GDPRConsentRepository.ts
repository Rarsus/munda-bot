import { Pool } from 'pg';
import { BaseRepository } from '../BaseRepository';
import { logger } from '../../logger';
import {
  IGDPRConsent,
  IGDPRConsentInput,
  IGDPRConsentUpdateInput,
  ConsentType,
  ConsentStatus,
} from '../../../interfaces/gdpr';

/**
 * Consent management repository
 * Tracks user consent for data processing
 * Global consent structure (not guild-specific)
 */
export class GDPRConsentRepository extends BaseRepository<IGDPRConsent> {
  constructor(pool: Pool) {
    super(pool, 'gdpr_consent');
  }

  /**
   * Get all consents for a user
   */
  async getUserConsents(userId: string): Promise<IGDPRConsent[]> {
    try {
      const result = await this.query(`SELECT * FROM ${this.tableName} WHERE user_id = $1`, [
        userId,
      ]);
      return result.rows;
    } catch (error) {
      logger.error(`Error getting consents for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get specific consent for user
   */
  async getUserConsent(userId: string, consentType: ConsentType): Promise<IGDPRConsent | null> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE user_id = $1 AND consent_type = $2`,
        [userId, consentType]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error getting ${consentType} consent for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create consent record
   */
  async createConsent(input: IGDPRConsentInput): Promise<IGDPRConsent> {
    try {
      const id = `consent_${input.user_id}_${input.consent_type}_${Date.now()}`;
      const result = await this.query(
        `INSERT INTO ${this.tableName} (id, user_id, consent_type, status, given_at, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING *`,
        [
          id,
          input.user_id,
          input.consent_type,
          input.status,
          input.given_at || (input.status === ConsentStatus.GIVEN ? new Date() : null),
          1, // Version 1
        ]
      );
      return result.rows[0];
    } catch (error) {
      logger.error(`Error creating consent:`, error);
      throw error;
    }
  }

  /**
   * Update consent status
   */
  async updateConsent(
    userId: string,
    consentType: ConsentType,
    input: IGDPRConsentUpdateInput
  ): Promise<IGDPRConsent> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (input.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(input.status);
      }
      if (input.withdrawn_at !== undefined) {
        updates.push(`withdrawn_at = $${paramIndex++}`);
        values.push(input.withdrawn_at);
      }
      if (input.expires_at !== undefined) {
        updates.push(`expires_at = $${paramIndex++}`);
        values.push(input.expires_at);
      }

      updates.push(`updated_at = NOW()`);
      values.push(userId);
      values.push(consentType);

      const result = await this.query(
        `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE user_id = $${paramIndex++} AND consent_type = $${paramIndex} RETURNING *`,
        values
      );

      if (!result.rows[0]) {
        throw new Error(`Consent not found for user ${userId}`);
      }

      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating consent for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Withdraw all consents for user
   */
  async withdrawAllConsents(userId: string): Promise<number> {
    try {
      const result = await this.query(
        `UPDATE ${this.tableName} SET status = $1, withdrawn_at = NOW(), updated_at = NOW() WHERE user_id = $2 RETURNING id`,
        [ConsentStatus.WITHDRAWN, userId]
      );
      logger.info(`Withdrew ${result.rows.length} consents for user ${userId}`);
      return result.rows.length;
    } catch (error) {
      logger.error(`Error withdrawing consents for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check if user has given consent
   */
  async hasConsent(userId: string, consentType: ConsentType): Promise<boolean> {
    try {
      const consent = await this.getUserConsent(userId, consentType);
      if (!consent) return false;

      // Check if still valid
      if (consent.expires_at && new Date() > consent.expires_at) {
        return false;
      }

      return consent.status === ConsentStatus.GIVEN;
    } catch (error) {
      logger.error(`Error checking consent:`, error);
      return false;
    }
  }
}
