# Container Variables Configuration Guide

This document explains where and how to store different types of container variables for Cloud Run deployment.

## Variable Types & Storage Locations

### 1. Secrets (Sensitive Data)

**Store in:** Google Secret Manager  
**Access:** Cloud Run `--update-secrets`  
**Rotation:** With `gcloud secrets versions add`

Examples:
- Discord bot token
- Database passwords
- API keys
- Private credentials

**How it works:**
```bash
# Create/update secret
echo -n "sensitive-value" | gcloud secrets create SECRET_NAME --data-file=-

# Deploy with secret
gcloud run deploy discord-bot \
  --update-secrets=DISCORD_TOKEN=DISCORD_TOKEN:latest,DATABASE_URL=DATABASE_URL:latest
```

**In application code:**
```typescript
const token = process.env.DISCORD_TOKEN;  // Automatically injected
const dbUrl = process.env.DATABASE_URL;   // Automatically injected
```

### 2. Environment Configuration

**Store in:** Cloud Run `--update-env-vars`  
**Access:** Cloud Run environment variables  
**Visibility:** Yes (visible in Cloud Console)

Examples:
- NODE_ENV=production
- LOG_LEVEL=info
- GCP_PROJECT_ID
- DATABASE_REGION=europe-west4

**How it works:**
```bash
# Deploy with environment variables
gcloud run deploy discord-bot \
  --update-env-vars=\
NODE_ENV=production,\
LOG_LEVEL=info,\
GCP_PROJECT_ID=my-project
```

**In application code:**
```typescript
const nodeEnv = process.env.NODE_ENV;           // "production"
const logLevel = process.env.LOG_LEVEL;         // "info"
const gcpProject = process.env.GCP_PROJECT_ID;  // "my-project"
```

### 3. Build-time Configuration

**Store in:** Dockerfile ARG / environment  
**Access:** During image build only  
**Persists:** In built image (not changeable at runtime)

Examples:
- Base image versions
- Build flags
- Default environment

**How it works:**
```dockerfile
ARG NODE_VERSION=20
ARG BUILD_DATE=unknown

ENV NODE_ENV=production
ENV PORT=8080
```

### 4. Local Development

**Store in:** `.env` file (Git-ignored)  
**Access:** Loaded by `dotenv` package  
**Visibility:** Local machine only

Example `.env`:
```dotenv
DISCORD_TOKEN=test-token
DATABASE_URL=postgresql://botuser:password@localhost:5432/discord_bot
NODE_ENV=development
LOG_LEVEL=debug
```

**In application code:**
```typescript
import dotenv from 'dotenv';
dotenv.config();

const token = process.env.DISCORD_TOKEN
