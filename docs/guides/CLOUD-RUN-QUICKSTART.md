# Cloud Run + Cloud SQL Quick Start Guide

**Deployment Target:** Google Cloud Run in **Netherlands (europe-west4)**

## Quick Summary

This project is configured for serverless deployment with:

- **Service:** Discord bot running on Cloud Run
- **Database:** Persistent PostgreSQL on Cloud SQL
- **Region:** Netherlands (europe-west4 - Amsterdam)
- **Container Registry:** eu.gcr.io (European registry for faster builds)
- **Secrets:** Google Secret Manager (DISCORD_TOKEN, DATABASE_URL)
- **VPC:** Private connection to Cloud SQL via VPC Connector

## 30-Second Deployment

```bash
# 1. Authenticate with Google Cloud
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 2. Run deployment script
chmod +x deploy-cloud-run.sh
./deploy-cloud-run.sh

# 3. Follow the prompts to provide:
#    - Project ID
#    - Discord Bot Token
#    - PostgreSQL password
```

That's it! The script handles:
- ✅ Enabling required APIs
- ✅ Creating VPC Connector
- ✅ Provisioning Cloud SQL PostgreSQL
- ✅ Creating service accounts
- ✅ Storing secrets securely
- ✅ Building and pushing Docker image
- ✅ Deploying to Cloud Run

## Architecture at a Glance

```
┌─────────────────────────────────────────┐
│     Cloud Run (europe-west4)            │
│                                         │
│  discord-bot service                   │
│  • Min: 1 instance                      │
│  • Max: 10 instances (auto-scale)       │
│  • Memory: 512 Mi                       │
│  • CPU: 1 vCPU                          │
│                                         │
└────────────────────┬────────────────────┘
                     │ (VPC Connector)
                     │
┌────────────────────▼────────────────────┐
│  Cloud SQL (europe-west4)               │
│                                         │
│  PostgreSQL 16                          │
│  • Database: discord_bot                │
│  • User: botuser                        │
│  • Storage: 10 GB (auto-grows to 100)  │
│  • Backups: Daily (7-day retention)    │
│                                         │
└─────────────────────────────────────────┘

Secrets (Secret Manager):
├── DISCORD_TOKEN
└── DATABASE_URL
```

## Key Files

| File | Purpose |
|------|---------|
| `deploy-cloud-run.sh` | Automated deployment script |
| `cloudbuild.yaml` | CI/CD pipeline (Cloud Build) |
| `Dockerfile` | Container definition |
| `.env.example` | Environment variable template |
| `docs/guides/GCP-DEPLOYMENT-GUIDE.md` | Full deployment guide |
| `docs/guides/SECRETS-MANAGEMENT.md` | Secrets & variables guide |

## Common Tasks

### View Live Logs

```bash
gcloud run logs read discord-bot --region=europe-west4 --follow
```

### Update the Bot Code and Redeploy

```bash
# 1. Make code changes
# 2. Commit to GitHub
# 3. Cloud Build auto-deploys via cloudbuild.yaml
# Or manually:

docker build -t eu.gcr.io/YOUR_PROJECT_ID/discord-bot:latest .
gcloud auth configure-docker eu.gcr.io
docker push eu.gcr.io/YOUR_PROJECT_ID/discord-bot:latest
gcloud run deploy discord-bot \
  --image=eu.gcr.io/YOUR_PROJECT_ID/discord-bot:latest \
  --region=europe-west4
```

### Update Discord Token (Secret)

```bash
# 1. Get new token from Discord Developer Portal
echo -n "NEW_TOKEN_HERE" | \
  gcloud secrets versions add DISCORD_TOKEN --data-file=-

# 2. Redeploy (picks up new secret version automatically)
gcloud run deploy discord-bot \
  --image=eu.gcr.io/YOUR_PROJECT_ID/discord-bot:latest \
  --region=europe-west4
```

### Connect to Database from Local Machine

```bash
# Create Cloud SQL Proxy tunnel
gcloud sql connect discord-bot-db --user=botuser

# Then in another terminal, connect via psql
psql -h localhost -U botuser -d discord_bot
```

### Scale Up for High Traffic

```bash
# Increase max instances to 100
gcloud run deploy discord-bot \
  --region=europe-west4 \
  --max-instances=100

# Increase memory to 1 GB
gcloud run deploy discord-bot \
  --region=europe-west4 \
  --memory=1Gi
```

### Monitor Service Health

```bash
gcloud run services describe discord-bot --region=europe-west4

# View metrics in Cloud Console:
# https://console.cloud.google.com/run/detail/europe-west4/discord-bot/metrics
```

## Requirements Checklist

- [ ] GCP Project created and billing enabled
- [ ] gcloud CLI installed and authenticated
- [ ] Docker installed
- [ ] Discord Bot Token obtained
- [ ] PostgreSQL password prepared (min 8 characters)

## Regional Choice: Why Netherlands?

**europe-west4** (Amsterdam) region chosen for:

✅ **GDPR Compliance** - Data residency in EU  
✅ **Low Latency** - Serves EU users efficiently  
✅ **Cost Effective** - Competitive pricing in EU  
✅ **Local Support** - European customer support  
✅ **Privacy** - EU privacy regulations compliance  

(Original project already has GDPR requirements - see GDPR-COMPLIANCE.md)

## Before You Deploy

1. **Ensure Code is Ready**
   ```bash
   npm run build
   npm run lint
   ```

2. **Verify Dockerfile**
   ```bash
   docker build -t test .
   docker run -it test
   ```

3. **Test Locally (if possible)**
   ```bash
   docker compose up
   ```

4. **Have Credentials Ready**
   - GCP Project ID
   - Discord Bot Token (from discord.com/developers)
   - Secure PostgreSQL password

## Cost Estimate

| Service | Usage | Cost |
|---------|-------|------|
| Cloud Run | 1M requests/month, 512Mi RAM | ~$2.50 |
| Cloud SQL | 24/7 db-f1-micro instance | ~$12 |
| Container Registry | ~100 MB image storage | ~$0.03 |
| Secret Manager | 2 secrets | ~$0.06 |
| Network | Data transfer | ~$0.12 |
| **Monthly Total** | | **~$15** |

(Cost varies by usage - this is a baseline estimate)

## Support & Troubleshooting

**Bot won't start?**
```bash
gcloud run logs read discord-bot --region=europe-west4 --limit=100
```

**Can't connect to database?**
```bash
gcloud sql connect discord-bot-db --user=botuser
```

**Docker image push fails?**
```bash
gcloud auth configure-docker eu.gcr.io
```

**Need more memory/CPU?**
- Update in deploy script under `MEMORY` and `CPU` variables
- Or manually: `gcloud run deploy discord-bot --memory=1Gi --region=europe-west4`

## Next Steps After Deployment

1. ✅ Monitor logs for errors
2. ✅ Test bot commands in Discord
3. ✅ Set up Cloud Monitoring alerts
4. ✅ Enable Cloud SQL automated backups (included by default)
5. ✅ Configure custom domain (optional)
6. ✅ Set up CI/CD via Cloud Build (included via cloudbuild.yaml)

## Full Documentation

- **[GCP-DEPLOYMENT-GUIDE.md](GCP-DEPLOYMENT-GUIDE.md)** - Comprehensive manual setup
- **[SECRETS-MANAGEMENT.md](SECRETS-MANAGEMENT.md)** - Secret storage & rotation
- **[GDPR-COMPLIANCE.md](../../GDPR-COMPLIANCE.md)** - Privacy & compliance
- **[ARCHITECTURE.md](../../ARCHITECTURE.md)** - System design

## Quick Links

- [Google Cloud Console](https://console.cloud.google.com/)
- [Cloud Run Dashboard](https://console.cloud.google.com/run)
- [Cloud SQL Instances](https://console.cloud.google.com/sql/instances)
- [Secret Manager](https://console.cloud.google.com/security/secret-manager)
- [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers)

## Questions?

Check the full documentation in `docs/guides/` directory for detailed explanations of every setup step.
