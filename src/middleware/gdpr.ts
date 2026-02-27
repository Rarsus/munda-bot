import { GDPRService } from '../services/gdpr';
import { ConsentType } from '../interfaces/gdpr';
import { AuthorizationError } from './errorHandler';
import { logger } from '../services/logger';

/**
 * GDPR Middleware
 * Enforces GDPR compliance:
 * - Consent checks
 * - Data access control
 * - Audit logging
 */

/**
 * Require user consent for an operation
 */
export async function requireConsent(
  userId: string,
  consentType: ConsentType,
  gdprService: GDPRService
): Promise<void> {
  try {
    // Only check consent if it's a data processing operation
    const hasConsent = await gdprService.hasConsent(userId, consentType);

    if (!hasConsent) {
      throw new AuthorizationError(
        `User consent required for ${consentType}. Use the /gdpr consent command to manage your preferences.`
      );
    }
  } catch (error) {
    logger.error(`Error checking consent for ${userId}:`, error);
    throw error;
  }
}

/**
 * Verify user data ownership
 * Only the user themselves or authorized admins can access their data
 */
export async function verifyDataOwnership(
  requestingUserId: string,
  dataSubjectUserId: string,
  isAdmin = false
): Promise<boolean> {
  if (isAdmin) {
    return true; // Admins can access all data
  }

  // Users can only access their own data
  if (requestingUserId === dataSubjectUserId) {
    return true;
  }

  return false;
}

/**
 * Verify guild member data access
 * User can access their own member data, guild owners can access all
 */
export async function verifyGuildMemberDataAccess(
  requestingUserId: string,
  memberUserId: string,
  guildOwnerId?: string
): Promise<boolean> {
  // User can access their own member data
  if (requestingUserId === memberUserId) {
    return true;
  }

  // Guild owner can access guild member data
  if (guildOwnerId && requestingUserId === guildOwnerId) {
    return true;
  }

  return false;
}

/**
 * Log data access for audit trail
 */
export async function logDataAccess(
  gdprService: GDPRService,
  userId: string,
  resourceType: 'user' | 'member' | 'guild',
  resourceId: string,
  action: string
): Promise<void> {
  try {
    const repos = gdprService.getRepositories();
    await repos.audit.logEvent({
      event_type: `${resourceType.toUpperCase()}_DATA_ACCESSED` as any,
      subject_user_id: userId,
      resource_type: resourceType,
      resource_id: resourceId,
      action,
    });
  } catch (error) {
    logger.error(`Error logging data access:`, error);
    // Don't throw - audit logging shouldn't break the operation
  }
}

/**
 * Check if user is within data access deadline
 * GDPR gives 30 days to comply with data access/portability requests
 */
export function isWithinComplianceDeadline(requestDate: Date): boolean {
  const now = new Date();
  const thirtyDaysLater = new Date(requestDate);
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
  return now <= thirtyDaysLater;
}

/**
 * List GDPR data access request
 */
export async function createDataAccessRequest(
  gdprService: GDPRService,
  userId: string,
  requestType: 'access' | 'portability' | 'erasure'
): Promise<any> {
  try {
    const repos = gdprService.getRepositories();
    const request = await repos.dataAccess.createRequest({
      user_id: userId,
      request_type: requestType,
      data_format: 'json',
    });

    logger.info(`Created ${requestType} request for user ${userId}`);
    return request;
  } catch (error) {
    logger.error(`Error creating data access request:`, error);
    throw error;
  }
}
