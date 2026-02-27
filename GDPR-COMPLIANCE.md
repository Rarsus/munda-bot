# GDPR Compliance Architecture

This document describes the GDPR compliance implementation for the Discord bot, including segregated database structures, user data rights, and consent management.

## Overview

The bot implements **full GDPR compliance** with:

- ✅ **Data Segregation**: User data, member data, and guild data are completely separated
- ✅ **User Rights**: Right to Access, Rectification, Erasure, Data Portability, and Restriction
- ✅ **Consent Management**: Explicit consent tracking for data processing
- ✅ **Audit Logging**: Complete audit trail of all data access and modifications
- ✅ **Data Minimization**: Only necessary data is collected
- ✅ **Encryption**: All sensitive data encrypted at rest and in transit
- ✅ **Retention Policies**: Automatic deletion of data beyond retention periods

---

## Data Segregation Architecture

### 1. Global User Data (`gdpr_user_data`)

Stores **only** data directly belonging to the user (not guild-specific):

```
- user_id (Discord ID) - Primary Key
- username
- discriminator (#xxxx)
- email (optional)
- avatar_url
- locale
- bio
- created_at / updated_at
- deleted_at (soft delete for GDPR)
```

**Access Control**: Only the user themselves or authorized admins can access

**Separation**: Completely independent of guild data

### 2. Guild Member Data (`gdpr_guild_member_data`)

Stores **segregated** member data per guild:

```
- id (uuid) - Primary Key
- guild_id - Guild ownership (segregation key)
- user_id - Reference only (NOT embedded)
- joined_at
- roles (array of role IDs)
- nick (guild-specific nickname)
- mute / deaf / pending flags
- timed_out_until
- created_at / updated_at
- deleted_at (soft delete)
```

**Key Points**:

- Each guild owns its members' data
- User IDs are references only (no duplication)
- Deleting user data ONLY affects global user data
- Deleting guildbans ALL member records for that guild

### 3. Consent Records (`gdpr_consent`)

Global consent tracking (not guild-specific):

```
- id
- user_id - Which user
- consent_type - DATA_COLLECTION, MESSAGE_LOGGING, ANALYTICS, MARKETING
- status - GIVEN, WITHDRAWN, EXPIRED
- given_at / withdrawn_at / expires_at
- version - Policy version for compliance
- created_at / updated_at
```

**Policy**: Consent is:

- Explicit (opt-in, not opt-out)
- Granular (per consent type)
- Timestamped (for audit trail)
- Revocable (can be withdrawn anytime)

### 4. Audit Logs (`gdpr_audit_log`)

**NEVER DELETED** (legal requirement):

```
- id
- event_type - USER_DATA_ACCESSED, USER_DATA_CREATED, ERASURE_COMPLETED, etc.
- subject_user_id - WHO the data is about
- requesting_user_id - WHO requested access
- resource_type - user | member | guild
- resource_id
- guild_id (if applicable)
- action - Detailed description
- changes - JSON of what changed
- ip_address_hash - Hashed IP (audit trail)
- user_agent_hash - Hashed user agent
- created_at
- retained_until - Never delete before this date
```

---

## User Rights Implementation

### Right to Access (Article 15)

**Command**: `/gdprdata`

Users can retrieve their personal data:

```typescript
const userData = await gdprService.getUserData(userId);
// Returns: IGDPRUserData | null
```

**Access Control**: Only the user themselves

**Audit**: Every access is logged

### Right to Data Portability (Article 20)

**Command**: `/gdprexport`

Users can export data in machine-readable format:

```typescript
const package = await gdprService.getDataPortabilityPackage(userId);
// Returns: JSON file containing:
// - Personal profile
// - Guild memberships
// - Consent records
// - 50 recent audit entries
```

**Format**: JSON (universally compatible)

**Compliance**: 30-day response deadline

### Right to Rectification (Article 16)

Users can update their own data:

```typescript
await userDataRepository.updateUser(userId, {
  email: 'new@email.com',
  bio: 'Updated bio',
});
```

**Restrictions**:

- Users can only update their own data
- Admins can update any user's data (with audit logging)

### Right to Erasure / Right to be Forgotten (Article 17)

**Command**: `/gdprdelete [reason]`

Users can request deletion of all personal data:

```typescript
const request = await gdprService.requestErasure(userId, reason);
// Returns erasure request with 30-day compliance window

// Execute erasure (after validation):
const report = await gdprService.executeErasure(
  erasureRequestId,
  approvedBy // admin who approved
);
// Returns: Deletion certificate for user's records
```

**What Gets Deleted**:

- ✅ User profile data
- ✅ All guild member records
- ✅ Consent history
- ❌ Audit logs (retained by law)

**Deletion Process**:

1. User submits request to /gdprdelete
2. System validates request (30-day window)
3. Admin approval (optional, depending on policy)
4. Data permanently deleted with atomic transaction
5. Deletion certificate generated and provided to user

### Right to Restrict Processing (Article 18)

Users can restrict how their data is processed via:

```typescript
// Withdraw specific consent
await gdprService.withdrawConsent(userId, ConsentType.ANALYTICS);

// All subsequent processing of that data stops
// But data isn't deleted
```

---

## Consent Management

### Consent Types

```typescript
enum ConsentType {
  DATA_COLLECTION = 'data_collection',
  MESSAGE_LOGGING = 'message_logging',
  ANALYTICS = 'analytics',
  MARKETING = 'marketing',
}
```

### Consent Workflow

1. **Initial Consent**: User gives explicit consent when joining

```typescript
const consent = await gdprService.giveConsent(userId, ConsentType.DATA_COLLECTION);
```

2. **Check Consent Before Processing**:

```typescript
const canProcess = await gdprService.hasConsent(userId, ConsentType.MESSAGE_LOGGING);

if (!canProcess) {
  // Skip logging this user's messages
}
```

3. **Withdraw Consent**:

```typescript
await gdprService.withdrawConsent(userId, ConsentType.ANALYTICS);
```

---

## Audit Trail & Logging

### Audit Events

Every data operation is logged:

```typescript
enum AuditEventType {
  USER_DATA_ACCESSED,
  USER_DATA_CREATED,
  USER_DATA_UPDATED,
  USER_DATA_DELETED,
  MEMBER_DATA_ACCESSED,
  MEMBER_DATA_CREATED,
  MEMBER_DATA_UPDATED,
  MEMBER_DATA_DELETED,
  EXPORT_REQUESTED,
  ERASURE_REQUESTED,
  ERASURE_COMPLETED,
  CONSENT_GIVEN,
  CONSENT_WITHDRAWN,
}
```

### Logging Example

```typescript
await auditRepository.logEvent({
  event_type: AuditEventType.USER_DATA_ACCESSED,
  subject_user_id: userId, // Whose data
  requesting_user_id: adminId, // Who accessed it
  resource_type: 'user',
  resource_id: userId,
  action: 'Admin accessed user data for investigation',
  ip_address_hash: hash(ipAddress),
  user_agent_hash: hash(userAgent),
});
```

### User Access to Audit Trail

Users can request their audit trail:

```typescript
const auditLogs = await auditRepository.exportUserAuditTrail(userId);
// Shows: Who viewed their data, when, and why
```

---

## Database Schema (SQL)

### gdpr_user_data

```sql
CREATE TABLE gdpr_user_data (
  user_id VARCHAR(255) PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  discriminator VARCHAR(4),
  email VARCHAR(255),
  avatar_url TEXT,
  locale VARCHAR(10),
  bio TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  UNIQUE(email) -- Ensure email uniqueness
);

CREATE INDEX idx_user_id ON gdpr_user_data(user_id);
CREATE INDEX idx_deleted_at ON gdpr_user_data(deleted_at);
```

### gdpr_guild_member_data

```sql
CREATE TABLE gdpr_guild_member_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  joined_at TIMESTAMP NOT NULL,
  roles JSONB DEFAULT '[]',
  nick VARCHAR(255),
  mute BOOLEAN DEFAULT FALSE,
  deaf BOOLEAN DEFAULT FALSE,
  pending BOOLEAN DEFAULT FALSE,
  timed_out_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  -- Composite unique to prevent duplicates per guild
  UNIQUE(guild_id, user_id),
  -- Foreign keys (optional, depends on guild table)
  FOREIGN KEY(user_id) REFERENCES gdpr_user_data(user_id)
);

CREATE INDEX idx_guild_id ON gdpr_guild_member_data(guild_id);
CREATE INDEX idx_user_id ON gdpr_guild_member_data(user_id);
CREATE INDEX idx_guild_user ON gdpr_guild_member_data(guild_id, user_id);
```

### gdpr_consent

```sql
CREATE TABLE gdpr_consent (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  consent_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'given',
  given_at TIMESTAMP,
  withdrawn_at TIMESTAMP,
  expires_at TIMESTAMP,
  version INT DEFAULT 1,
  ip_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, consent_type),
  FOREIGN KEY(user_id) REFERENCES gdpr_user_data(user_id)
);

CREATE INDEX idx_user_id ON gdpr_consent(user_id);
CREATE INDEX idx_consent_type ON gdpr_consent(consent_type);
```

### gdpr_audit_log

```sql
CREATE TABLE gdpr_audit_log (
  id VARCHAR(255) PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  subject_user_id VARCHAR(255),
  requesting_user_id VARCHAR(255),
  resource_type VARCHAR(20) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  guild_id VARCHAR(255),
  action TEXT,
  changes JSONB,
  ip_address_hash VARCHAR(255),
  user_agent_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  retained_until TIMESTAMP NOT NULL,
  archived BOOLEAN DEFAULT FALSE,
  -- NEVER DELETE BEFORE retained_until
  CONSTRAINT no_premature_delete CHECK (NOW() < retained_until OR archived = true)
);

-- Indices for common queries
CREATE INDEX idx_subject_user ON gdpr_audit_log(subject_user_id);
CREATE INDEX idx_requesting_user ON gdpr_audit_log(requesting_user_id);
CREATE INDEX idx_resource ON gdpr_audit_log(resource_type, resource_id);
CREATE INDEX idx_guild ON gdpr_audit_log(guild_id);
CREATE INDEX idx_event_type ON gdpr_audit_log(event_type);
CREATE INDEX idx_created ON gdpr_audit_log(created_at);
CREATE INDEX idx_retained ON gdpr_audit_log(retained_until);
```

---

## Implementation Best Practices

### 1. Data Minimization

```typescript
// ✅ GOOD: Only collect necessary data
const userData = {
  user_id: context.user.id,
  username: context.user.username,
  // No collection of: IP, device info, browsing history, etc.
};

// ❌ BAD: Collecting unnecessary data
const userData = {
  everything: context.user,
  allMessages: [],
  ipAddress: request.ip,
};
```

### 2. Consent Before Processing

```typescript
// ✅ GOOD: Check consent first
if (await gdprService.hasConsent(userId, ConsentType.MESSAGE_LOGGING)) {
  // Only then log the message
  await logMessage(message);
}

// ❌ BAD: Process first, ask later
await logMessageWithoutConsent(message);
```

### 3. Secure Deletion

```typescript
// ✅ GOOD: Use prepared statements and transactions
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... perform all deletions
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
}

// ❌ BAD: String concatenation (SQL injection)
await pool.query(`DELETE FROM users WHERE id = '${userId}'`);
```

### 4. Audit Everything

```typescript
// ✅ GOOD: Log every data access
await auditRepository.logEvent({
  event_type: AuditEventType.USER_DATA_ACCESSED,
  subject_user_id: userId,
  requesting_user_id: adminId,
  action: 'Verified user age for parental consent',
});

// ❌ BAD: Silent data access
const user = await getUserData(userId); // No audit trail
```

### 5. Segregated Access

```typescript
// ✅ GOOD: User can only see their data
async function getMyData(userId: string) {
  return await userDataRepository.getUserById(userId);
  // Only the user's own ID is passed
}

// ❌ BAD: User can see others' data
async function getNobodysDatum(request: Request) {
  const targetUserId = request.query.userId; // User-provided!
  return await userDataRepository.getUserById(targetUserId);
}
```

---

## Compliance Deadlines

| Right                     | Deadline  | Implementation            |
| ------------------------- | --------- | ------------------------- |
| Right to Access           | 30 days   | `/gdprdata` command       |
| Right to Rectification    | Immediate | User profile settings     |
| Right to Erasure          | 30 days   | `/gdprdelete` command     |
| Right to Data Portability | 30 days   | `/gdprexport` command     |
| Right to Restrict         | Immediate | Consent withdrawal        |
| Breach Notification       | 72 hours  | Admin notification system |

---

## Retention Policies

### User Data

- **Retention**: Kept until user requests deletion or 3 years of inactivity
- **After Deletion**: Marked `deleted_at` (soft delete) for 90 days, then permanent deletion

### Guild Member Data

- **Retention**: For duration of guild membership
- **After Leaving**: Soft deleted, permanent deletion after 30 days

### Consent Records

- **Retention**: Until revoked or expiration date
- **After Revocation**: Kept in archive indefinitely (audit requirement)

### Audit Logs

- **Retention**: Minimum 3 years (legal requirement)
- **After Retention**: May be archived to cold storage but NEVER deleted

---

## Testing GDPR Compliance

### User Data Access Test

```bash
# User requests their own data
/gdprdata

# Should return:
# - User's profile information
# - Audit log entry
# - No other user's data
```

### Data Export Test

```bash
# User requests data portability
/gdprexport json

# Should return:
# - JSON file with all personal data
# - Guild memberships
# - Consent history
# - Recent audit trail
```

### Data Deletion Test

```bash
# User requests data erasure
/gdprdelete

# Should:
# - Create erasure request
# - Mark for deletion
# - Generate deletion certificate
# - Retain audit logs
```

---

## Admin Management

### View GDPR Requests

```typescript
// Get pending erasure requests
const pending = await erasureRepository.getPendingErasureRequests();

// Approve erasure
await erasureRepository.approveErasureRequest(requestId, adminId);

// Execute erasure
const report = await gdprService.executeErasure(requestId, adminId);
```

### Audit Trail Queries

```typescript
// View user's data access history
const auditLogs = await auditRepository.getUserAuditLogs(userId);

// Export for compliance report
const report = await auditRepository.exportUserAuditTrail(userId);
```

---

## References

- [GDPR - Regulation (EU) 2016/679](https://gdpr-info.eu/)
- [Right to be Forgotten - Article 17](https://gdpr-info.eu/art-17-gdpr/)
- [Data Portability - Article 20](https://gdpr-info.eu/art-20-gdpr/)
- [Data Protection Officer Guide](https://gdpr-info.eu/chapter-4/)

---

## Support & Questions

For questions about GDPR compliance or data rights:

- ✉️ Email: privacy@example.com
- 🎟️ Submit a request: `/gdprdata`, `/gdprexport`, `/gdprdelete`
- 📖 Read: This documentation

---

**Last Updated**: 2025-02-27
**Version**: 1.0
**Status**: ✅ Production Ready
