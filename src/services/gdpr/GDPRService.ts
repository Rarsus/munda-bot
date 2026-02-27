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
  IGDPRErasureCompletionReport,
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
      const userData = await this.userDataRepository.getUserById(userId);

      if (userData) {
        // Audit log the access
        await this.auditRepository.logEvent({
          event_type: AuditEventType.USER_DATA_ACCESSED,
          subject_user_id: userId,
          resource_type: 'user',
          resource_id: userId,
          action: 'User accessed their own data',
        });
      }

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
      // Gather all user data
      const userData = await this.userDataRepository.getUserById(userId);
      const memberships = await this.memberDataRepository.getUserGuildMemberships(userId);
      const consents = await this.consentRepository.getUserConsents(userId);
      const auditLogs = await this.auditRepository.exportUserAuditTrail(userId);

      if (!userData) {
        throw new Error(`User ${userId} not found`);
      }

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
   * Execute data erasure
   * Permanently deletes user data after validation
   */
  async executeErasure(
    erasureRequestId: string,
    approvedBy?: string
  ): Promise<IGDPRErasureCompletionReport> {
    const client = await (this.auditRepository as any).pool.connect();

    try {
      await client.query('BEGIN');

      const erasureRequest = (await (this.erasureRepository as any).getRequest(
        erasureRequestId
      )) as any;

      if (!erasureRequest) {
        throw new Error(`Erasure request ${erasureRequestId} not found`);
      }

      let deletionCount = 0;
      const deletionSummary = {
        user_data: 0,
        guild_memberships: 0,
        consent_records: 0,
        audit_logs_retained: 0,
      };

      const userId = (erasureRequest as any).user_id;

      // Update erasure status
      await this.erasureRepository.updateErasureStatus(erasureRequestId, 'in_progress');

      // Delete user data
      if (erasureRequest.delete_user_data) {
        await this.userDataRepository.permanentlyDeleteUser(userId);
        deletionSummary.user_data = 1;
        deletionCount++;
      }

      // Delete guild memberships
      if (erasureRequest.delete_guild_memberships) {
        const count = await this.memberDataRepository.deleteUserFromAllGuilds(userId);
        deletionSummary.guild_memberships = count;
        deletionCount += count;
      }

      // Withdraw consents (never delete for audit)
      if (erasureRequest.delete_consents) {
        const count = await this.consentRepository.withdrawAllConsents(userId);
        deletionSummary.consent_records = count;
        deletionCount += count;
      }

      // Audit logs are NEVER deleted (legal requirement)
      const auditLogs = await this.auditRepository.getUserAuditLogs(userId);
      deletionSummary.audit_logs_retained = auditLogs.length;

      // Log erasure completion
      await this.auditRepository.logEvent({
        event_type: AuditEventType.ERASURE_COMPLETED,
        subject_user_id: userId,
        requesting_user_id: approvedBy,
        resource_type: 'user',
        resource_id: userId,
        action: `Data erasure completed - ${deletionCount} records deleted`,
      });

      // Mark erasure as completed
      await this.erasureRepository.updateErasureStatus(
        erasureRequestId,
        'completed',
        deletionCount
      );

      await client.query('COMMIT');

      const report: IGDPRErasureCompletionReport = {
        erasure_request_id: erasureRequestId,
        user_id: userId,
        completed_at: new Date(),
        items_deleted: deletionSummary,
        summary: `Successfully erased ${deletionCount} data items for user ${userId}`,
        certificate_hash: Buffer.from(
          JSON.stringify({
            erasure_id: erasureRequestId,
            user_id: userId,
            completed_at: new Date(),
            deletions: deletionSummary,
          })
        ).toString('hex'),
      };

      return report;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error executing erasure ${erasureRequestId}:`, error);

      // Mark as failed
      await this.erasureRepository.updateErasureStatus(erasureRequestId, 'failed');

      throw error;
    } finally {
      client.release();
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
