# Discord Bot on Google Cloud

A production-ready TypeScript Discord bot running on Google Cloud containers with PostgreSQL backend.

## Architecture Overview

```
Discord Bot (TypeScript)
    ↓
Google Cloud Container (Node.js 20)
    ↓
PostgreSQL Database
```

### Deployment Options:

1. **Cloud Run** (Recommended for stateless bots)
2. **Google Kubernetes Engine (GKE)** (For complex deployments)
3. **Cloud App Engine** (Alternative flexible runtime)
4. **Cloud Compute Engine** (If more control needed)

## Project Structure

```
.
├── src/
│   ├── index.ts              # Main bot entry point
│   ├── services/
│   │   ├── database.ts       # PostgreSQL connection pool
│   │   └── logger.ts         # Logging service (Winston)
│   └── commands/             # Command handlers (optional)
├── Dockerfile                # Multi-stage container build
├── docker-compose.yml        # Local development setup
├── package.json              # Node.js dependencies
├── tsconfig.json             # TypeScript configuration
├── cloudbuild.yaml           # Google Cloud Build config
├── app.yaml                  # Cloud App Engine config
├── k8s-deployment.yaml       # Kubernetes deployment manifest
├── init.sql                  # Database schema initialization
└── .env.example              # Environment variables template
```

## Prerequisites

- Node.js 20+
- Docker (for local development)
- Google Cloud Project with billing enabled
- Discord Bot Token
- PostgreSQL database (managed service in GCP)

## Local Development

### 1. Clone and Install

```bash
npm install
```

### 2. Setup Environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Run with Docker Compose

```bash
docker-compose up --build
```

This starts:

- Discord bot (Node.js container)
- PostgreSQL database
- Automatic schema initialization

### 4. Development Mode (with hot reload)

```bash
npm run dev
```

## Building for Production

### Build TypeScript

```bash
npm run build
```

### Test Docker Image Locally

```bash
docker build -t discord-bot:latest .
docker run -e DISCORD_TOKEN=your_token -e DATABASE_URL=postgresql://... discord-bot:latest
```

## Google Cloud Deployment

### Option 1: Cloud Run (Recommended)

#### Setup CloudSQL for PostgreSQL:

```bash
# Create Cloud SQL instance
gcloud sql instances create discord-bot-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=us-central1

# Create database
gcloud sql databases create discord_bot \
  --instance=discord-bot-db

# Create user
gcloud sql users create botuser \
  --instance=discord-bot-db --password=STRONG_PASSWORD
```

#### Build and Deploy:

```bash
# Set project
gcloud config set project YOUR_PROJECT_ID

# Build image
gcloud builds submit --config=cloudbuild.yaml

# Or deploy directly with Cloud Run (if not using cloudbuild.yaml)
gcloud run deploy discord-bot \
  --source . \
  --platform managed \
  --region us-central1 \
  --memory 512M \
  --cpu 1 \
  --set-env-vars DISCORD_TOKEN=your_token,DATABASE_URL=postgresql://...
```

#### Store secrets securely:

```bash
# Create secrets in Secret Manager
echo -n "your_discord_token" | gcloud secrets create DISCORD_TOKEN --data-file=-
echo -n "postgresql://..." | gcloud secrets create DATABASE_URL --data-file=-

# Update Cloud Run to use secrets
gcloud run deploy discord-bot \
  --update-secrets=DISCORD_TOKEN=DISCORD_TOKEN:latest,DATABASE_URL=DATABASE_URL:latest
```

### Option 2: Google Kubernetes Engine (GKE)

#### Create GKE Cluster:

```bash
gcloud container clusters create discord-bot-cluster \
  --zone=us-central1-a \
  --num-nodes=3 \
  --machine-type=e2-medium

# Get credentials
gcloud container clusters get-credentials discord-bot-cluster --zone=us-central1-a
```

#### Deploy with Kubernetes:

```bash
# Update gcr.io/PROJECT_ID in k8s-deployment.yaml

# Create secrets
kubectl create namespace discord-bot
kubectl -n discord-bot create secret generic bot-secrets \
  --from-literal=DISCORD_TOKEN=your_token \
  --from-literal=DATABASE_URL=postgresql://...

# Apply manifest
kubectl apply -f k8s-deployment.yaml
```

### Option 3: App Engine

```bash
# Deploy directly
gcloud app deploy app.yaml

# View logs
gcloud app logs read -n 50

# Manage service
gcloud app versions list
```

## Environment Variables

| Variable        | Required | Description                      |
| --------------- | -------- | -------------------------------- |
| `DISCORD_TOKEN` | ✅       | Your Discord bot token           |
| `DATABASE_URL`  | ✅       | PostgreSQL connection string     |
| `NODE_ENV`      | ❌       | `production` or `development`    |
| `LOG_LEVEL`     | ❌       | `debug`, `info`, `warn`, `error` |

## Database Schema

The bot includes a pre-configured schema with tables for:

- `users` - Discord users
- `guilds` - Discord servers
- `guild_members` - Guild membership
- `audit_logs` - Bot activity logs

Initialize PostgreSQL:

```bash
psql postgresql://user:pass@host/discord_bot < init.sql
```

## Monitoring & Logging

### Cloud Logging

```bash
# View logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=discord-bot"

# Real-time logs
gcloud logging read --limit 50 --follow
```

### Local Logs

Logs are written to `logs/` directory (combined.log and error.log)

## Scaling Configuration

### Cloud Run (Automatic)

- Min instances: 1
- Max instances: 10 (configurable)
- CPU: 1 @ 512MB memory
- Auto-scales based on traffic

### Kubernetes (Manual)

HPA configured for:

- CPU: 70% utilization trigger
- Memory: 80% utilization trigger
- Min replicas: 2
- Max replicas: 10

## Security Best Practices

✅ Non-root container user
✅ Secrets in Secret Manager (not in code)
✅ Health checks enabled
✅ Resource limits configured
✅ Read-only filesystem where possible
✅ No privilege escalation

## Troubleshooting

### Bot not responding:

```bash
# Cloud Run logs
gcloud run services describe discord-bot --region us-central1

# Cloud Logging
gcloud logging read "resource.type=cloud_run_revision" --limit 50
```

### Database connection issues:

```bash
# Test connection locally
psql $DATABASE_URL

# Cloud SQL proxy (if using private IP)
gcloud sql proxy INSTANCE_CONNECTION_NAME
```

### Container issues:

```bash
# Test locally
docker build -t discord-bot .
docker run --env-file .env discord-bot

# Push to registry
docker tag discord-bot:latest gcr.io/PROJECT_ID/discord-bot:latest
docker push gcr.io/PROJECT_ID/discord-bot:latest
```

## Cost Estimation (Google Cloud)

**Cloud Run:**

- Requests: ~$0.40 per 1M requests
- Memory: ~$6.50 per GB-month
- Estimate: $5-15/month (low traffic)

**Cloud SQL (db-f1-micro):**

- Instance: $9.50/month
- Storage: ~$0.18/GB/month
- Estimate: $10-20/month

**Total: ~$20-35/month** for small deployments

## Additional Resources

- [Discord.js Documentation](https://discord.js.org/)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Docker Documentation](https://docs.docker.com/)

## License

MIT
