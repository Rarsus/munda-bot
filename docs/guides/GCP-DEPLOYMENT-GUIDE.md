# Google Cloud Run Deployment Guide

## Overview

This guide covers deploying the Discord bot to **Google Cloud Run** in the **Netherlands (europe-west4)** with a persistent **Cloud SQL PostgreSQL** database.

**Key Features:**
- ✅ Serverless deployment (Cloud Run)
- ✅ Persistent database (Cloud SQL PostgreSQL)
- ✅ Data residency in Netherlands (europe-west4 region)
- ✅ Automatic scaling (1-10 instances)
- ✅ Secure secret management (Secret Manager)
- ✅ VPC connectivity to Cloud SQL
- ✅ Automatic backups
- ✅ Monitoring and logging

## Architecture

```
┌─────────────────────────────────────────────────────┐
│            Google Cloud Project                      │
├─────────────────────────────────────────────────────┤
│                                                       │
│  Cloud Run Service (europe-west4)                    │
│  ┌─────────────────────────────────────────────────┐ │
│  │  discord-bot                                     │ │
│  │  • memory: 512 Mi                               │ │
│  │  • cpu: 1                                       │ │
│  │  • min instances: 1                             │ │
│  │  • max instances: 10                            │ │
│  └─────────────────────────────────────────────────┘ │
│            │                                          │
│            │ (VPC Connector)                          │
│            ▼                                          │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Cloud SQL PostgreSQL (europe-west4)            │ │
│  │  • DB: discord_bot                              │ │
│  │  • User: botuser                                │ │
│  │  • Storage: 10 GB (auto-increase to 100 GB)   │ │
│  │  • Backups: Daily (7 day retention)            │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  Secret Manager                                      │
│  • DISCORD_TOKEN                                     │
│  • DATABASE_URL                                      │
│                                                       │
│  Container Registry (eu.gcr.io)                     │
│  • Image: discord-bot                               │
│                                                       │
│  Cloud Build                                        │
│  • Automatic CI/CD pipeline                         │
│                                                       │
└─────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Tools

Install these tools before deployment:

1. **Google Cloud SDK (gcloud)**
   ```bash
   # Install: https://cloud.google.com/sdk/docs/install
   gcloud --version
   ```

2. **Docker**
   ```bash
   # Install: https://docs.docker.com/get-docker/
   docker --version
   ```

3. **Node.js & npm** (for local testing)
   ```bash
   node --version  # v20.0.0 or higher
   npm --version
   ```

### GCP Account Setup

1. **Create a Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Click "Create Project"
   - Name: `discord-bot` (or your preference)
   - Click "Create"

2. **Enable Billing**
   - Project must have billing enabled
   - Cloud Run: ~$0.00001667 per CPU-second
   - Cloud SQL: ~$10-50/month for db-f1-micro

3. **Authenticate gcloud**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

## Automated Deployment

### Using the Deploy Script (Recommended)

The easiest way to deploy is using the provided deployment script:

```bash
chmod +x deploy-cloud-run.sh
./deploy-cloud-run.sh
```

**What the script does:**
1. ✅ Validates prerequisites (gcloud, Docker, npm)
2. ✅ Sets up GCP project and enables APIs
3. ✅ Creates VPC Connector (for Cloud SQL access)
4. ✅ Provisions Cloud SQL PostgreSQL instance
5. ✅ Creates service account with IAM roles
6. ✅ Stores secrets in Secret Manager
7. ✅ Builds Docker image
8. ✅ Pushes image to Container Registry
9. ✅ Deploys to Cloud Run in Netherlands

**Usage:**
```bash
# Interactive deployment
./deploy-cloud-run.sh

# Answer prompts:
# - GCP Project ID
# - Discord Bot Token (or use existing secret)
# - PostgreSQL password
# - Confirm configuration
```

## Manual Deployment Steps

If you prefer to set up manually, follow these steps:

### 1. Set Active Project

```bash
gcloud config set project YOUR_PROJECT_ID
```

### 2. Enable Required APIs

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  containerregistry.googleapis.com \
  artifactregistry.googleapis.com \
  compute.googleapis.com \
  servicenetworking.googleapis.com \
  iam.googleapis.com
```

### 3. Create VPC Connector

```bash
gcloud compute networks vpc-access connectors create discord-bot-connector \
  --region=europe-west4 \
  --subnet=default \
  --machine-type=f1-micro \
  --min-throughput=200 \
  --max-throughput=1000
```

### 4. Create Cloud SQL Instance

```bash
# Create instance
gcloud sql instances create discord-bot-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=europe-west4 \
  --storage-type=PD-SSD \
  --storage-size=10GB \
  --storage-auto-increase \
  --storage-auto-increase-limit=100 \
  --backup-start-time=03:00 \
  --retained-backups-count=7

# Create database
gcloud sql databases create discord_bot \
  --instance=discord-bot-db

# Create user
gcloud sql users create botuser \
  --instance=discord-bot-db \
  --password=YOUR_SECURE_PASSWORD

# Get connection details
gcloud sql instances describe discord-bot-db \
  --format="value(connectionName)"
```

### 5. Create Service Account

```bash
# Create service account
gcloud iam service-accounts create discord-bot \
  --display-name="Discord Bot Service Account"

# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:discord-bot@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# Grant Secret Accessor role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:discord-bot@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 6. Store Secrets

```bash
# Discord Token
echo -n "YOUR_DISCORD_TOKEN" | gcloud secrets create DISCORD_TOKEN --data-file=-

# Database URL
echo -n "postgresql://botuser:PASSWORD@IP_ADDRESS/discord_bot" | \
  gcloud secrets create DATABASE_URL --data-file=-
```

### 7. Build and Push Docker Image

```bash
# Build image
docker build -t eu.gcr.io/YOUR_PROJECT_ID/discord-bot:latest .

# Configure Docker auth
gcloud auth configure-docker eu.gcr.io

# Push image
docker push eu.gcr.io/YOUR_PROJECT_ID/discord-bot:latest
```

### 8. Deploy to Cloud Run

```bash
gcloud run deploy discord-bot \
  --image=eu.gcr.io/YOUR_PROJECT_ID/discord-bot:latest \
  --region=europe-west4 \
  --platform=managed \
  --memory=512Mi \
  --cpu=1 \
  --timeout=3600 \
  --execution-environment=gen2 \
  --service-account=discord-bot@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --update-secrets=DISCORD_TOKEN=DISCORD_TOKEN:latest,DATABASE_URL=DATABASE_URL:latest \
  --update-env-vars=NODE_ENV=production,LOG_LEVEL=info \
  --vpc-connector=discord-bot-connector \
  --vpc-egress=private-ranges-only \
  --no-allow-unauthenticated \
  --min-instances=1 \
  --max-instances=10
```

## Managing Secrets

### Overview

The bot requires two secrets:

| Secret | Description | Source |
|--------|-------------|--------|
| `DISCORD_TOKEN` | Discord bot token from Discord Developer Portal | [developer.discord.com](https://discord.com/developers/applications) |
| `DATABASE_URL` | PostgreSQL connection string | Cloud SQL instance |

### Storing Secrets in Secret Manager

**Create a new secret:**
```bash
echo -n "secret-value" | gcloud secrets create SECRET_NAME --data-file=-
```

**Update an existing secret:**
```bash
echo -n "new-secret-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

**List all secrets:**
```bash
gcloud secrets list
```

**View secret versions:**
```bash
gcloud secrets versions list SECRET_NAME
```

**Delete a secret:**
```bash
gcloud secrets delete SECRET_NAME
```

### Secret Format

**DATABASE_URL:**
```
postgresql://botuser:PASSWORD@PUBLIC_IP:5432/discord_bot
```

Example:
```
postgresql://botuser:mySecurePassword@34.141.123.45:5432/discord_bot
```

**DISCORD_TOKEN:**
```
YOUR_DISCORD_BOT_TOKEN
```

Example:
```
MTk4NjIyNDgzNjIyNTI4MDA4.Clwa7A.l7rSeztnUNGIEVPuCfguMnet
```

## Container Variable Storage Options

### Recommended Approach: Secret Manager + Cloud Run Environment Variables

**For Sensitive Data (Secrets):**
- Store in **Google Secret Manager**
- Reference in Cloud Run deployment with `--update-secrets`
- Mounted as environment variables at runtime
- Rotated without redeployment
- Encrypted at rest
- Automatic backup

**For Non-Sensitive Configuration:**
- Store in **Cloud Run environment variables**
- Set with `--update-env-vars`
- Examples:
  - `NODE_ENV=production`
  - `LOG_LEVEL=info`
  - `GCP_PROJECT_ID=your-project-id`

### Example Deployment with Variables

```bash
gcloud run deploy discord-bot \
  --update-secrets=\
DISCORD_TOKEN=DISCORD_TOKEN:latest,\
DATABASE_URL=DATABASE_URL:latest \
  --update-env-vars=\
NODE_ENV=production,\
LOG_LEVEL=info,\
GCP_PROJECT_ID=your-project-id,\
CLOUD_SQL_CONNECTION_NAME=project:region:instance
```

### Alternative: Cloud Build Substitutions

For automated CI/CD via Cloud Build:

```yaml
# cloudbuild.yaml
substitutions:
  _DISCORD_TOKEN: ""
  _DATABASE_URL: ""

steps:
  - name: 'gcr.io/cloud-builders/run'
    args:
      - 'deploy'
      - 'discord-bot'
      - '--update-secrets'
      - 'DISCORD_TOKEN=DISCORD_TOKEN:latest,DATABASE_URL=DATABASE_URL:latest'
```

Trigger with:
```bash
gcloud builds submit \
  --substitutions=_DISCORD_TOKEN="token-value",_DATABASE_URL="url-value"
```

## Monitoring and Logging

### View Cloud Run Logs

**Real-time logs:**
```bash
gcloud run logs read discord-bot --region=europe-west4 --follow
```

**Last 50 log entries:**
```bash
gcloud run logs read discord-bot --region=europe-west4 --limit=50
```

**Filter by severity:**
```bash
gcloud run logs read discord-bot --region=europe-west4 \
  --filter="severity=ERROR"
```

### Monitor in Cloud Console

1. Go to [Cloud Run Console](https://console.cloud.google.com/run)
2. Select service `discord-bot`
3. View metrics:
   - **Requests per second**
   - **Error rate**
   - **Latency (p50, p95, p99)**
   - **Memory usage**
   - **CPU usage**

### Set up Alerts

```bash
# Create alert policy for high error rate
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="Discord Bot High Error Rate" \
  --condition-name="error-rate-high"
```

## Database Management

### Connect to Cloud SQL from Local Machine

**Using Cloud SQL Proxy:**
```bash
# Install Cloud SQL Proxy
curl https://dl.google.com/cloudsql/cloud_sql_proxy.linux.amd64 -o cloud_sql_proxy
chmod +x cloud_sql_proxy

# Get Cloud SQL connection name
INSTANCE=$(gcloud sql instances describe discord-bot-db --format="value(connectionName)")

# Start proxy
./cloud_sql_proxy -instances=$INSTANCE=tcp:5432 &

# Connect to local port 5432
psql -h localhost -U botuser -d discord_bot
```

**Using gcloud SQL Connect:**
```bash
gcloud sql connect discord-bot-db --user=botuser
```

### Backup and Recovery

**View backups:**
```bash
gcloud sql backups list --instance=discord-bot-db
```

**Backup Cloud SQL (manual):**
```bash
gcloud sql backups create \
  --instance=discord-bot-db \
  --description="Manual backup before migration"
```

**Restore from backup:**
```bash
gcloud sql instances clone BACKUP_ID NEW_INSTANCE_ID
```

**Note:** Automated backups are enabled (daily, 7-day retention)

## Scaling Configuration

### Current Setup

```yaml
Min Instances:  1
Max Instances:  10
Memory:         512 Mi
CPU:            1
Timeout:        3600 seconds (1 hour)
```

### Adjust Scaling

```bash
# Increase max instances to 50
gcloud run deploy discord-bot \
  --region=europe-west4 \
  --max-instances=50

# Increase memory to 1 GB
gcloud run deploy discord-bot \
  --region=europe-west4 \
  --memory=1Gi

# Set min instances to 5
gcloud run deploy discord-bot \
  --region=europe-west4 \
  --min-instances=5
```

## CI/CD with Cloud Build

### Automatic Deployment from GitHub

**Prerequisites:**
- GitHub repository connected to Google Cloud
- `cloudbuild.yaml` in repository root (included)

**Setup:**
1. Go to [Cloud Build](https://console.cloud.google.com/cloud-build/triggers)
2. Click "Create Trigger"
3. Select source: GitHub
4. Choose repository and branch (main)
5. Build configuration: cloudbuild.yaml
6. Create trigger

**Deployment workflow:**
```
Push to main branch
    ↓
Cloud Build triggered
    ↓
Build Docker image
    ↓
Push to Container Registry
    ↓
Deploy to Cloud Run
    ↓
Service updated automatically
```

## Troubleshooting

### Service won't start

**Check logs:**
```bash
gcloud run logs read discord-bot --region=europe-west4 --limit=100
```

**Common issues:**
- **Port binding:** Bot must listen on `$PORT` (default 8080)
- **Memory limit:** Increase with `--memory=1Gi`
- **Timeout:** Increase with `--timeout=7200`

### Can't connect to database

**Check Cloud SQL:**
```bash
gcloud sql instances describe discord-bot-db
```

**Verify VPC Connector:**
```bash
gcloud compute networks vpc-access connectors describe discord-bot-connector --region=europe-west4
```

**Test connection:**
```bash
gcloud sql connect discord-bot-db --user=botuser
```

**Fix:** Update DATABASE_URL secret with correct IP and password

### Docker build fails

**Clear Docker cache:**
```bash
docker system prune -a
```

**Check Dockerfile:**
```bash
docker build -t test . --no-cache
```

### Authentication issues

**Check service account permissions:**
```bash
gcloud projects get-iam-policy YOUR_PROJECT_ID \
  --flatten="bindings[].members" \
  --format="table(bindings.role)" \
  --filter="bindings.members:discord-bot@"
```

## Useful References

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)
- [GCP Regions & Zones](https://cloud.google.com/compute/docs/regions-zones)

## Cost Estimation (Monthly)

| Service | Usage | Estimated Cost |
|---------|-------|-----------------|
| Cloud Run | 1M requests, 512Mi RAM | $2.50 |
| Cloud SQL (db-f1-micro) | 24/7 operation | $10-15 |
| Cloud Storage (backups) | 10GB storage | $0.20 |
| Secret Manager | 2 secrets | $0.06 |
| Data Transfer | Out of region | $0.12/GB |
| **Total Estimate** | | **$15-30/month** |

**Cost optimization tips:**
- Use `min-instances=0` for non-critical bots (saves on idle time)
- Archive old Cloud SQL backups
- Monitor data transfer costs regularly

## Support & Issues

For issues or questions:
1. Check [Google Cloud Status Dashboard](https://status.cloud.google.com/)
2. Review [Cloud Run Quotas](https://cloud.google.com/run/quotas)
3. Check deployment logs with `gcloud run logs read`
4. Review GitHub Issues in this repository
