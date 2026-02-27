/**
 * GDPR Data Portability and Erasure
 * Supports "Right to Data Portability" and "Right to be Forgotten"
 */

/**
 * Data Access Request - user requests their own data
 */
export interface IGDPRDataAccessRequest {
  id: string;
  user_id: string;
  request_type: 'access' | 'portability' | 'erasure';
  status: 'pending' | 'approved' | 'denied' | 'completed' | 'expired';
  requested_at: Date;
  expires_at: Date; // 30-day window
  completed_at?: Date;
  data_format?: 'json' | 'csv'; // For portability
  download_url?: string; // Temporary signed URL
  created_at: Date;
  updated_at: Date;
}

/**
 * Data access request creation input
 */
export interface IGDPRDataAccessRequestInput {
  user_id: string;
  request_type: 'access' | 'portability' | 'erasure';
  data_format?: 'json' | 'csv';
}

/**
 * Portable user data package
 */
export interface IGDPRDataPortablePackage {
  user: {
    id: string;
    username: string;
    email?: string;
    profile: Record<string, any>;
    created_at: Date;
  };
  consents: Array<{
    type: string;
    status: string;
    given_at?: Date;
    withdrawn_at?: Date;
  }>;
  guild_memberships: Array<{
    guild_id: string;
    guild_name: string;
    joined_at: Date;
    roles: string[];
    member_data: Record<string, any>;
  }>;
  audit_summary: {
    total_accesses: number;
    last_accessed: Date;
    access_history: Array<{
      event: string;
      date: Date;
    }>;
  };
  exported_at: Date;
  export_version: string;
}

/**
 * Erasure request for "Right to be Forgotten"
 * Complete data deletion with audit trail
 */
export interface IGDPRErasureRequest {
  id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'in_progress' | 'completed' | 'failed';
  requested_at: Date;
  approved_at?: Date;
  completed_at?: Date;
  reason?: string; // Why user is requesting erasure

  // Deletion targets
  delete_user_data: boolean; // Global user profile
  delete_guild_memberships: boolean; // All guild member records
  delete_consents: boolean; // Consent history
  delete_audit_logs: boolean; // Access logs (may be kept by law)

  // Audit trail
  approved_by?: string; // If admin approval needed
  error_message?: string;
  deletions_count?: number; // How many records deleted

  created_at: Date;
  updated_at: Date;
}

/**
 * Erasure request creation input
 */
export interface IGDPRErasureRequestInput {
  user_id: string;
  delete_user_data?: boolean;
  delete_guild_memberships?: boolean;
  delete_consents?: boolean;
  delete_audit_logs?: boolean;
  reason?: string;
}

/**
 * Erasure completion report
 */
export interface IGDPRErasureCompletionReport {
  erasure_request_id: string;
  user_id: string;
  completed_at: Date;
  items_deleted: {
    user_data: number;
    guild_memberships: number;
    consent_records: number;
    audit_logs_retained: number; // By legal requirement
  };
  summary: string;
  certificate_hash: string; // For proof of deletion
}
