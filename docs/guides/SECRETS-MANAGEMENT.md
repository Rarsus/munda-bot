# Container Secrets Management Guide

For Google Cloud Run deployment, secrets and configuration variables are managed through **Google Secret Manager** and **Cloud Run environment variables**. This document explains best practices for secure secret storage and rotation.

## Storage Locations Overview

### 1. Google Secret Manager (Recommended for Secrets)

**What to store here:**
- Discord Bot Token (DISCORD_TOKEN)
- Database passwords
- API keys
- Private credentials

**Benefits:**
- Encrypted at rest (AES-256)
- Encrypted in transit (TLS)
- Automated rotation support
- Audit logging (who accessed what)
- Versioning (rollback capability)
- Secrets never appear in logs

**Access:** Secrets mounted as environment variables in Cloud Run

**Cost:** ~$0.06/month for 2 secrets

**Example:**
```bash
# Create secret
echo -n "MTk4NjIyNDgzNjIyNTI4MDA4.Clwa7A.l7rSeztnUNGIEVPuCfguMnet" | \
  gcloud secrets create DISCORD_TOKEN --data-file=-

# Use in Cloud Run
gcloud run deploy discord-bot \
  --update-secrets=DISCORD_TOKEN=DISCORD_TOKEN:latest
```

### 2. Cloud Run Environment Variables (For Config)

**What to store here:**
- NODE_ENV=production
- LOG_LEVEL=info
- GCP_PROJECT_ID
- Database connection parameters (non-secret)
- Feature flags
- URLs/endpoints

**Benefits:**
- Easy to update without redeploy
- Visible in Cloud Console
- Version-controlled (tracked in Git)
- No additional cost
- Environment-specific configuration

**Access:** Automatically injected at runtime

**Example:**
```bash
gcloud run deploy discord-bot \
  --update-env-vars=\
NODE_ENV=production,\
LOG_LEVEL=info,\
GCP_PROJECT_ID=my-project
```

### 3. Dockerfile/Build-time Configuration

**What to store here:**
- Build arguments (used during image build only)
- Default values for non-sensitive config

**Not recommended for:**
- Secrets
- Credentials
- Anything user-specific

**Example:**
```dockerfile
ARG NODE_VERSION=20
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
```

## Secret Rotation Strategy

### Automated Rotation

For secrets that need regular rotation:

1. **Update in Secret Manager:**
```bash
echo -n "new-token-value" | \
  gcloud secrets versions add DISCORD_TOKEN --data-file=-
```

2. **Redeploy Cloud Run Service:**
```bash
# Cloud Run automatically picks up latest version
gcloud run deploy discord-bot \
  --image=eu.gcr.io/$PROJECT_ID/discord-bot:latest \
  --region=europe-west4
```

No code changes needed! Cloud Run automatically uses `latest` version.

### Scheduled Rotation Script

```bash
#!/bin/bash
# rotate-secrets.sh - Rotate secrets monthly

SECRET_NAME="DISCORD_TOKEN"
NEW_VALUE=$(fetch_new_token_from_discord)

# Update secret
echo -n "$NEW_VALUE" | gcloud secrets versions add $SECRET_NAME --data-file=-

# Redeploy
gcloud run deploy discord-bot \
  --image=eu.gcr.io/$PROJECT_ID/discord-bot:latest \
  --region=europe-west4

echo "Secret $SECRET_NAME rotated successfully"
```

Schedule with Cloud Scheduler:
```bash
gcloud scheduler jobs create pubsub rotate-secrets \
  --schedule="0 0 1 * *" \
  --topic=rotate-secrets \
  --message-body='{"action":"rotate"}'
```

## Configuration Matrix

### Local Development (.env file)

```dotenv
DISCORD_TOKEN=test-token-for-dev
DATABASE_URL=postgresql://botuser:devpassword@localhost:5432/discord_bot
NODE_ENV=development
LOG_LEVEL=debug
GCP_PROJECT_ID=dev-project
```

**File location:** `.env` (ignored by Git via .gitignore)

**Security:** Your local machine only

### Production (Cloud Run + Secret Manager)

| Variable | Storage | Value | Rotation |
|----------|---------|-------|----------|
| DISCORD_TOKEN | Secret Manager | Actual bot token | Monthly |
| DATABASE_URL | Secret Manager | Cloud SQL connection | On password resets |
| NODE_ENV | Env Variable | `production` | Never |
| LOG_LEVEL | Env Variable | `info` | On demand |
| GCP_PROJECT_ID | Env Variable | Project ID | Never |
| CLOUD_SQL_CONNECTION_NAME | Env Variable | Instance connection name | Never |

## Secret Manager Operations

### List All Secrets

```bash
gcloud secrets list

# Output:
# NAME            CREATED              REPLICATION_POLICY
# DATABASE_URL    2026-02-27T10:00:00  automatic
# DISCORD_TOKEN   2026-02-27T10:00:00  automatic
```

### View Secret Versions

```bash
gcloud secrets versions list DISCORD_TOKEN

# Output:
# NAME  CREATED              STATE
# 2     2026-02-27T10:30:00  enabled
# 1     2026-02-27T10:00:00  disabled
```

### Update Secret (Add New Version)

```bash
echo -n "new-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

### View Secret Value

```bash
# CAUTION: Shows secret in plaintext!
gcloud secrets versions access latest --secret=DISCORD_TOKEN

# Share with specific user
gcloud secrets versions access latest --secret=DISCORD_TOKEN > /tmp/secret.txt
chmod 400 /tmp/secret.txt
```

### Disable Old Version

```bash
gcloud secrets versions disable 1 --secret=DISCORD_TOKEN
```

### Delete Secret (Irreversible!)

```bash
gcloud secrets delete DISCORD_TOKEN
```

## Access Control (IAM)

### Grant Secret Access to Service Account

```bash
# Service account: discord-bot@project-id.iam.gserviceaccount.com
# Role: Secret Accessor

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:discord-bot@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Audit Secret Access

```bash
# View who accessed secret (via Cloud Audit Logs)
gcloud logging read \
  "resource.type=secretmanager.googleapis.com AND protoPayload.methodName=google.cloud.secretmanager.v1.SecretManagerService.AccessSecretVersion" \
  --limit=50 \
  --format=json
```

## Application Code: Accessing Secrets

The Discord bot application receives secrets as **environment variables** automatically:

```typescript
// src/index.ts
const discordToken = process.env.DISCORD_TOKEN;
const databaseUrl = process.env.DATABASE_URL;
const nodeEnv = process.env.NODE_ENV;

if (!discordToken) {
  throw new Error('DISCORD_TOKEN environment variable is not set');
}

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Use them normally
client.login(discordToken);
```

Cloud Run automatically:
1. Retrieves secret values from Secret Manager
2. Mounts them as environment variables
3. Makes them available to the application
4. Cleans up after the process ends

**No special code needed!**

## Best Practices

### DO ✅

- Store all credentials in Secret Manager
- Use non-root service accounts
- Enable audit logging
- Rotate secrets regularly
- Use strong passwords (16+ characters)
- Version control non-secret configuration
- Update secret versions, don't recreate
- Monitor Secret Manager access

### DON'T ❌

- Store secrets in environment variable definitions (use Secret Manager)
- Hardcode credentials in code
- Commit .env files to Git
- Print secrets in logs
- Share console access for secret viewing
- Reuse old secret versions
- Store secrets in Cloud Storage unencrypted
- Use weak passwords

## Troubleshooting

### Service Can't Access Secret

**Error:** `Secret 'DISCORD_TOKEN' not found`

**Solution:** Verify service account has `roles/secretmanager.secretAccessor` role:

```bash
gcloud projects get-iam-policy YOUR_PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:discord-bot@" \
  --format=table
```

### Secret Not Updated in Running Service

**Issue:** Changed secret but Cloud Run still has old value

**Solution:** Redeploy Cloud Run service:

```bash
gcloud run deploy discord-bot \
  --image=eu.gcr.io/$PROJECT_ID/discord-bot:latest \
  --region=europe-west4
```

### Can't View Secret Value

**Error:** "Permission denied"

**Solution:** Grant your user secret accessor role:

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="user:your-email@gmail.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Disable/Enable Secret Versions

```bash
# Disable version that's no longer needed
gcloud secrets versions disable VERSION_ID --secret=SECRET_NAME

# Enable previous version
gcloud secrets versions enable VERSION_ID --secret=SECRET_NAME
```

## Secret Matrix for Deploy Script

When running `./deploy-cloud-run.sh`, it creates these secrets automatically:

| Secret | Source | Format | Example |
|--------|--------|--------|---------|
| DISCORD_TOKEN | User input or existing | Plain text | `MTk4NjIyNDg3...` |
| DATABASE_URL | Generated from Cloud SQL | Connection string | `postgresql://botuser:pwd@ip/discord_bot` |

Both are stored in Google Secret Manager and injected into Cloud Run at startup.

## References

- [Google Secret Manager Docs](https://cloud.google.com/secret-manager/docs)
- [Cloud Run Secrets Integration](https://cloud.google.com/run/docs/configuring/secrets)
- [IAM Roles Reference](https://cloud.google.com/iam/docs/understanding-roles#basic-roles)
