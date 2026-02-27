/**
 * GDPR Consent Management
 * Tracks user consent for data collection and processing
 */

export enum ConsentType {
  DATA_COLLECTION = 'data_collection',
  MESSAGE_LOGGING = 'message_logging',
  ANALYTICS = 'analytics',
  MARKETING = 'marketing',
}

export enum ConsentStatus {
  GIVEN = 'given',
  WITHDRAWN = 'withdrawn',
  EXPIRED = 'expired',
}

/**
 * User consent record - independent of guild
 */
export interface IGDPRConsent {
  id: string;
  user_id: string; // Discord user ID, never deleted
  consent_type: ConsentType;
  status: ConsentStatus;
  given_at: Date | null;
  withdrawn_at: Date | null;
  expires_at: Date | null;
  version: number; // Policy version
  ip_hash?: string; // Hashed for audit trail
  created_at: Date;
  updated_at: Date;
}

/**
 * Consent request/creation input
 */
export interface IGDPRConsentInput {
  user_id: string;
  consent_type: ConsentType;
  status: ConsentStatus;
  given_at?: Date;
}

/**
 * Consent update input
 */
export interface IGDPRConsentUpdateInput {
  status?: ConsentStatus;
  withdrawn_at?: Date;
  expires_at?: Date;
}
