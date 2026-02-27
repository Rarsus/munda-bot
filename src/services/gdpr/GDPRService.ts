import { Pool } from 'pg';
import { logger } from '../logger';
import {
  GDPRUserDataRepository,
  GDPRGuildMemberDataRepository,
  GDPRConsentRepository,
  GDPRAuditLogRepository,
  GDPRDataAccessRequestRepository,
  GDPRErasureRequestRepository,
} from '../database/gdpr';
import {
  IGDPRUserData,
  IGDPRGuildMemberData,
  IGDPRConsent,
  IGDPRDataPortablePackage,
  ConsentType,
  AuditEventType,
} from '../../interfaces/gdpr';

/**
 * GDPR Service
 * Centralized service for GDPR compliance operations
 * Manages user data access, modification, deletion with full audit trail
 */
export class GDPRService {
  private userDataRepository: GDPRUserDataRepository;
  private memberDataRepository: GDPRGuildMemberDataRepository;
  private consentRepository: GDPRConsentRepository;
  private auditRepository: GDPRAuditLogRepository;
  private dataAccessRepository: GDPRDataAccessRequestRepository;
  private erasureRepository: GDPRErasureRequestRepository;

  constructor(pool: Pool) {
    this.userDataRepository = new GDPRUserDataRepository(pool);
    this.memberDataRepository = new GDPRGuildMemberDataRepository(pool);
    this.consentRepository = new GDPRConsentRepository(pool);
    this.auditRepository = new GDPRAuditLogRepository(pool);
    this.dataAccessRepository = new GDPRDataAccessRequestRepository(pool);
    this.erasureRepository = new GDPRErasureRequestRepository(pool);
  }

  /**
   * Get user data (Right to Access)
   * Only the user themselves or authorized admins can access
   */
  async getUserData(userId: string): Promise<IGDPRUserData | null> {
    try {
      let userData = await this.userDataRepository.getUserById(userId);

      // If user doesn't exist, create a minimal record
      // This ensures subsequent GDPR operations don't fail on foreign key constraints
      if (!userData) {
        userData = await this.userDataRepository.createUser({
          user_id: userId,
          username: `User_${userId.substring(0, 8)}`, // Placeholder username
          discriminator: '',
        });
      }

      // Audit log the access
      await this.auditRepository.logEvent({
        event_type: AuditEventType.USER_DATA_ACCESSED,
        subject_user_id: userId,
        resource_type: 'user',
        resource_id: userId,
        action: 'User accessed their own data',
      });

      return userData;
    } catch (error) {
      logger.error(`Error getting user data for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user's guild memberships
   */
  async getUserGuildMemberships(userId: string): Promise<IGDPRGuildMemberData[]> {
    try {
      const memberships = await this.memberDataRepository.getUserGuildMemberships(userId);

      // Audit log the access
      await this.auditRepository.logEvent({
        event_type: AuditEventType.MEMBER_DATA_ACCESSED,
        subject_user_id: userId,
        resource_type: 'member',
        resource_id: userId,
        action: 'User accessed their guild memberships',
      });

      return memberships;
    } catch (error) {
      logger.error(`Error getting guild memberships for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user's full data package (Right to Data Portability)
   */
  async getDataPortabilityPackage(userId: string): Promise<IGDPRDataPortablePackage> {
    try {
      // Ensure user exists in the database
      let userData = await this.userDataRepository.getUserById(userId);
      if (!userData) {
        // Create a minimal user record if they don't exist
        userData = await this.userDataRepository.createUser({
          user_id: userId,
          username: `User_${userId.substring(0, 8)}`, // Placeholder username
          discriminator: '',
        });
      }

      // Gather all user data
      const memberships = await this.memberDataRepository.getUserGuildMemberships(userId);
      const consents = await this.consentRepository.getUserConsents(userId);
      const auditLogs = await this.auditRepository.exportUserAuditTrail(userId);

      // Audit log the export request
      await this.auditRepository.logEvent({
        event_type: AuditEventType.EXPORT_REQUESTED,
        subject_user_id: userId,
        resource_type: 'user',
        resource_id: userId,
        action: 'User requested data export',
      });

      // Create portable package
      const portablePackage: IGDPRDataPortablePackage = {
        user: {
          id: userData.user_id,
          username: userData.username,
          email: userData.email,
          profile: {
            discriminator: userData.discriminator,
            avatar_url: userData.avatar_url,
            locale: userData.locale,
            bio: userData.bio,
          },
          created_at: userData.created_at,
        },
        consents: consents.map((c) => ({
          type: c.consent_type,
          status: c.status,
          given_at: c.given_at || undefined,
          withdrawn_at: c.withdrawn_at || undefined,
        })),
        guild_memberships: memberships.map((m) => ({
          guild_id: m.guild_id,
          guild_name: m.guild_id, // TODO: Fetch actual guild name
          joined_at: m.joined_at,
          roles: m.roles || [],
          member_data: {
            nick: m.nick,
            mute: m.mute,
            deaf: m.deaf,
          },
        })),
        audit_summary: {
          total_accesses: auditLogs.length,
          last_accessed: auditLogs[0]?.created_at || new Date(),
          access_history: auditLogs.slice(0, 50).map((log) => ({
            event: log.event_type,
            date: log.created_at,
          })),
        },
        exported_at: new Date(),
        export_version: '1.0',
      };

      return portablePackage;
    } catch (error) {
      logger.error(`Error getting data portability package for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Request data erasure (Right to be Forgotten)
   */
  async requestErasure(userId: string, reason?: string): Promise<any> {
    try {
      // Ensure user exists in the database before creating erasure request
      const existingUser = await this.userDataRepository.getUserById(userId);
      if (!existingUser) {
        // Create a minimal user record if they don't exist
        // This is necessary because gdpr_erasure_request has a foreign key constraint
        await this.userDataRepository.createUser({
          user_id: userId,
          username: `User_${userId.substring(0, 8)}`, // Placeholder username
          discriminator: '',
        });
      }

      const request = await this.erasureRepository.createErasureRequest({
        user_id: userId,
        reason,
        delete_user_data: true,
        delete_guild_memberships: true,
        delete_consents: true,
        delete_audit_logs: false, // Audit logs retained by law
      });

      // Audit log the erasure request
      await this.auditRepository.logEvent({
        event_type: AuditEventType.ERASURE_REQUESTED,
        subject_user_id: userId,
        resource_type: 'user',
        resource_id: userId,
        action: 'User requested data erasure',
      });

      return request;
    } catch (error) {
      logger.error(`Error requesting data erasure for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check user consent
   */
  async hasConsent(userId: string, consentType: ConsentType): Promise<boolean> {
    try {
      return await this.consentRepository.hasConsent(userId, consentType);
    } catch (error) {
      logger.error(`Error checking consent for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Give consent
   */
  async giveConsent(userId: string, consentType: ConsentType): Promise<IGDPRConsent> {
    try {
      const existing = await this.consentRepository.getUserConsent(userId, consentType);

      let consent: IGDPRConsent;

      if (existing) {
        consent = await this.consentRepository.updateConsent(userId, consentType, {
          status: 'given' as any,
        });
      } else {
        consent = await (this.consentRepository.createConsent as any)({
          user_id: userId,
          consent_type: consentType,
          status: 'given',
          given_at: new Date(),
        });
      }

      // Audit log
      await this.auditRepository.logEvent({
        event_type: AuditEventType.CONSENT_GIVEN,
        subject_user_id: userId,
        resource_type: 'user',
        resource_id: userId,
        action: `User gave consent for ${consentType}`,
      });

      return consent;
    } catch (error) {
      logger.error(`Error giving consent for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Withdraw consent
   */
  async withdrawConsent(userId: string, consentType: ConsentType): Promise<IGDPRConsent> {
    try {
      const consent = await this.consentRepository.updateConsent(userId, consentType, {
        status: 'withdrawn' as any,
        withdrawn_at: new Date(),
      });

      // Audit log
      await this.auditRepository.logEvent({
        event_type: AuditEventType.CONSENT_WITHDRAWN,
        subject_user_id: userId,
        resource_type: 'user',
        resource_id: userId,
        action: `User withdrew consent for ${consentType}`,
      });

      return consent;
    } catch (error) {
      logger.error(`Error withdrawing consent for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get erasure request status
   */
  async getErasureRequestStatus(requestId: string): Promise<any | null> {
    try {
      return await this.erasureRepository.getErasureRequestById(requestId);
    } catch (error) {
      logger.error(`Error getting erasure request status for ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Get pending erasure requests
   */
  async getPendingErasureRequests(): Promise<any[]> {
    try {
      return await this.erasureRepository.getPendingErasureRequests();
    } catch (error) {
      logger.error(`Error getting pending erasure requests:`, error);
      throw error;
    }
  }

  /**
   * Approve erasure request (admin action)
   */
  async approveErasureRequest(requestId: string, adminId: string): Promise<any> {
    try {
      const request = await this.erasureRepository.approveErasureRequest(requestId, adminId);

      // Audit log
      await this.auditRepository.logEvent({
        event_type: AuditEventType.ERASURE_APPROVED,
        subject_user_id: request.user_id,
        requesting_user_id: adminId,
        resource_type: 'erasure_request',
        resource_id: requestId,
        action: `Admin ${adminId} approved deletion request`,
      });

      return request;
    } catch (error) {
      logger.error(`Error approving erasure request ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Deny erasure request (admin action)
   */
  async denyErasureRequest(requestId: string, adminId: string, reason?: string): Promise<any> {
    try {
      const request = await this.erasureRepository.denyErasureRequest(requestId, adminId, reason);

      // Audit log
      await this.auditRepository.logEvent({
        event_type: AuditEventType.ERASURE_DENIED,
        subject_user_id: request.user_id,
        requesting_user_id: adminId,
        resource_type: 'erasure_request',
        resource_id: requestId,
        action: `Admin ${adminId} denied deletion request: ${reason || 'No reason provided'}`,
      });

      return request;
    } catch (error) {
      logger.error(`Error denying erasure request ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Execute data erasure (admin action)
   * Permanently deletes user data from all tables
   */
  async executeErasure(requestId: string, adminId: string): Promise<any> {
    const client = await (this.userDataRepository as any).pool.connect();

    try {
      await client.query('BEGIN');

      // Get request details
      const request = await this.erasureRepository.getErasureRequestById(requestId);
      if (!request) {
        throw new Error(`Erasure request ${requestId} not found`);
      }

      const userId = request.user_id;

      // Delete user data if requested
      if (request.delete_user_data) {
        await client.query('DELETE FROM gdpr_user_data WHERE user_id = $1', [userId]);
      }

      // Delete guild member data if requested
      if (request.delete_guild_memberships) {
        await client.query('DELETE FROM gdpr_guild_member_data WHERE user_id = $1', [userId]);
      }

      // Delete consent records if requested
      if (request.delete_consents) {
        await client.query('DELETE FROM gdpr_consent WHERE user_id = $1', [userId]);
      }

      // Delete audit logs if requested (with confirmation)
      if (request.delete_audit_logs) {
        await client.query(
          'UPDATE gdpr_audit_log SET archived = true WHERE subject_user_id = $1',
          [userId]
        );
      }

      // Mark erasure request as completed
      await this.erasureRepository.completeErasure(requestId);

      await client.query('COMMIT');

      // Audit log
      await this.auditRepository.logEvent({
        event_type: AuditEventType.ERASURE_COMPLETED,
        subject_user_id: userId,
        requesting_user_id: adminId,
        resource_type: 'erasure_request',
        resource_id: requestId,
        action: `Admin ${adminId} executed data deletion for user ${userId}`,
      });

      return request;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error executing erasure for request ${requestId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Restore erasure request (admin action)
   * Usable before 30 days pass and deletion is executed
   */
  async restoreErasureRequest(requestId: string, adminId: string, reason?: string): Promise<any> {
    try {
      const request = await this.erasureRepository.restoreErasureRequest(requestId, adminId, reason);

      // Audit log
      await this.auditRepository.logEvent({
        event_type: AuditEventType.ERASURE_RESTORED,
        subject_user_id: request.user_id,
        requesting_user_id: adminId,
        resource_type: 'erasure_request',
        resource_id: requestId,
        action: `Admin ${adminId} restored deletion request: ${reason || 'No reason provided'}`,
      });

      return request;
    } catch (error) {
      logger.error(`Error restoring erasure request ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Auto-cleanup expired erasure requests
   * Run this as a background job to automatically delete data after 30 days
   */
  async autoCleanupExpiredRequests(): Promise<number> {
    const client = await (this.userDataRepository as any).pool.connect();

    let deletedCount = 0;

    try {
      // Get all approved requests that are ready for deletion
      const readyForDeletion = await this.erasureRepository.getReadyForDeletion();

      for (const request of readyForDeletion) {
        try {
          await client.query('BEGIN');

          const userId = request.user_id;

          // Delete user data
          if (request.delete_user_data) {
            await client.query('DELETE FROM gdpr_user_data WHERE user_id = $1', [userId]);
          }

          // Delete guild member data
          if (request.delete_guild_memberships) {
            await client.query('DELETE FROM gdpr_guild_member_data WHERE user_id = $1', [userId]);
          }

          // Delete consent records
          if (request.delete_consents) {
            await client.query('DELETE FROM gdpr_consent WHERE user_id = $1', [userId]);
          }

          // Archive audit logs if requested
          if (request.delete_audit_logs) {
            await client.query(
              'UPDATE gdpr_audit_log SET archived = true WHERE subject_user_id = $1',
              [userId]
            );
          }

          // Mark erasure request as completed
          await this.erasureRepository.completeErasure(request.id);

          await client.query('COMMIT');

          // Audit log for automatic cleanup
          await this.auditRepository.logEvent({
            event_type: AuditEventType.ERASURE_COMPLETED,
            subject_user_id: userId,
            resource_type: 'erasure_request',
            resource_id: request.id,
            action: `Automatic cleanup: Data deletion executed after 30-day approval period`,
          });

          deletedCount++;
          logger.info(`Auto-cleanup: Deleted data for user ${userId} (request ${request.id})`);
        } catch (error) {
          await client.query('ROLLBACK');
          logger.error(
            `Error auto-cleaning up erasure request ${request.id}:`,
            error
          );
        }
      }

      return deletedCount;
    } catch (error) {
      logger.error(`Error in auto-cleanup of expired erasure requests:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Log audit event
   */
  async logAuditEvent(event: {
    event_type: AuditEventType | string;
    subject_user_id?: string;
    requesting_user_id?: string;
    resource_type: string;
    resource_id: string;
    action: string;
  }): Promise<void> {
    try {
      await this.auditRepository.logEvent(event as any);
    } catch (error) {
      logger.error(`Error logging audit event:`, error);
    }
  }

  /**
   * Get all repositories for direct access if needed
   */
  getRepositories() {
    return {
      userData: this.userDataRepository,
      memberData: this.memberDataRepository,
      consent: this.consentRepository,
      audit: this.auditRepository,
      dataAccess: this.dataAccessRepository,
      erasure: this.erasureRepository,
    };
  }
}

let gdprServiceInstance: GDPRService | null = null;

/**
 * Get or create GDPR service instance
 */
export function getGDPRService(pool?: Pool): GDPRService {
  if (!pool && !gdprServiceInstance) {
    throw new Error('GDPRService must be initialized with a database pool');
  }

  if (pool && !gdprServiceInstance) {
    gdprServiceInstance = new GDPRService(pool);
  }

  return gdprServiceInstance!;
}
