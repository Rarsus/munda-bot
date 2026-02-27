/**
 * GDPR Audit Logging
 * Tracks all data access, modification, and deletion for compliance
 */

export enum AuditEventType {
  // Data Access
  USER_DATA_ACCESSED = 'user_data_accessed',
  MEMBER_DATA_ACCESSED = 'member_data_accessed',
  GUILD_DATA_ACCESSED = 'guild_data_accessed',
  EXPORT_REQUESTED = 'export_requested',

  // Data Modification
  USER_DATA_CREATED = 'user_data_created',
  USER_DATA_UPDATED = 'user_data_updated',
  MEMBER_DATA_CREATED = 'member_data_created',
  MEMBER_DATA_UPDATED = 'member_data_updated',
  GUILD_DATA_UPDATED = 'guild_data_updated',

  // Data Deletion
  USER_DATA_DELETED = 'user_data_deleted',
  MEMBER_DATA_DELETED = 'member_data_deleted',
  GUILD_DATA_DELETED = 'guild_data_deleted',

  // Consent
  CONSENT_GIVEN = 'consent_given',
  CONSENT_WITHDRAWN = 'consent_withdrawn',

  // Erasure
  ERASURE_REQUESTED = 'erasure_requested',
  ERASURE_COMPLETED = 'erasure_completed',
}

/**
 * GDPR Audit Log Entry
 */
export interface IGDPRAuditLog {
  id: string;
  event_type: AuditEventType;

  // WHO: Which user performed/is subject of action
  subject_user_id?: string; // User being accessed/modified
  requesting_user_id?: string; // Admin who accessed it

  // WHAT: Data scope
  resource_type: 'user' | 'member' | 'guild';
  resource_id: string; // user_id, member_id, or guild_id
  guild_id?: string; // If member or guild resource

  // HOW: Details
  action: string; // Specific action performed
  changes?: Record<string, any>; // What changed (for updates)

  // SECURITY
  ip_address_hash?: string; // Hashed for audit trail
  user_agent_hash?: string; // Hashed

  // TIMESTAMPS
  created_at: Date;
  retained_until: Date; // GDPR retention policy date
}

/**
 * Audit log creation input
 */
export interface IGDPRAuditLogInput {
  event_type: AuditEventType;
  subject_user_id?: string;
  requesting_user_id?: string;
  resource_type: 'user' | 'member' | 'guild';
  resource_id: string;
  guild_id?: string;
  action: string;
  changes?: Record<string, any>;
  ip_address_hash?: string;
  user_agent_hash?: string;
}

/**
 * Data access response with audit context
 */
export interface IGDPRDataAccessResponse<T> {
  data: T;
  accessed_at: Date;
  access_reason: string; // Why the user/admin accessed it
  audit_id: string; // Reference to audit log
}
