#!/bin/bash

# Discord Bot Google Cloud Run Deployment Script
# Deploys bot to Google Cloud Run in Netherlands (europe-west4)
# Provisions Cloud SQL for persistent database
# Manages secrets in Google Secret Manager

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Discord Bot - Google Cloud Run Deployment       ║${NC}"
echo -e "${GREEN}║   Region: Netherlands (europe-west4)              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}\n"

# ============================================================================
# CONFIGURATION
# ============================================================================

REGION="europe-west4"
SERVICE_NAME="discord-bot"
DB_INSTANCE_NAME="discord-bot-db"
DB_NAME="discord_bot"
DB_USER="botuser"
DOCKER_REGISTRY="eu.gcr.io"
MACHINE_TYPE="db-f1-micro"
DISK_TYPE="PD-SSD"
DISK_SIZE="10GB"

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

check_prerequisites() {
    echo -e "${BLUE}[1/8]${NC} Checking prerequisites...\n"
    
    local missing=0
    
    if ! command -v gcloud &> /dev/null; then
        echo -e "${RED}❌ gcloud CLI not found${NC}"
        echo "   Install: https://cloud.google.com/sdk/docs/install"
        missing=1
    fi
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker not found${NC}"
        echo "   Install: https://docs.docker.com/get-docker/"
        missing=1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm not found${NC}"
        echo "   Install: https://nodejs.org/"
        missing=1
    fi
    
    if [ $missing -eq 1 ]; then
        exit 1
    fi
    
    echo -e "${GREEN}✅ All prerequisites installed${NC}\n"
}

collect_configuration() {
    echo -e "${BLUE}[2/8]${NC} Collecting configuration...\n"
    
    read -p "$(echo -e "${YELLOW}Enter GCP Project ID:${NC} ")" PROJECT_ID
    
    if [ -z "$PROJECT_ID" ]; then
        echo -e "${RED}Error: Project ID cannot be empty${NC}"
        exit 1
    fi
    
    echo ""
    echo -e "${YELLOW}Discord Bot Token Options:${NC}"
    echo "Option 1: Enter token here"
    echo "Option 2: Use existing Secret Manager secret"
    read -p "$(echo -e "${YELLOW}Choice (1/2, default: 1):${NC} ")" TOKEN_SOURCE
    TOKEN_SOURCE=${TOKEN_SOURCE:-1}
    
    if [ "$TOKEN_SOURCE" = "1" ]; then
        read -sp "$(echo -e "${YELLOW}Enter Discord Bot Token:${NC} ")" DISCORD_TOKEN
        echo ""
    else
        echo "Secret Manager secret will be used during deployment"
    fi
    
    echo ""
    read -sp "$(echo -e "${YELLOW}Enter PostgreSQL password:${NC} ")" DB_PASSWORD
    echo ""
    
    echo ""
    echo -e "${YELLOW}Configuration Summary:${NC}"
    echo "  Project ID:    $PROJECT_ID"
    echo "  Region:        $REGION"
    echo "  Service:       $SERVICE_NAME"
    echo "  DB Instance:   $DB_INSTANCE_NAME"
    echo "  DB Type:       PostgreSQL 16"
    echo "  DB Machine:    $MACHINE_TYPE"
    echo ""
    
    read -p "$(echo -e "${YELLOW}Continue with deployment? (y/n):${NC} ")" -n 1 -r CONFIRM
    echo ""
    
    if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled"
        exit 0
    fi
}

setup_gcp_project() {
    echo -e "\n${BLUE}[3/8]${NC} Setting up Google Cloud Project...\n"
    
    echo "Setting active project to $PROJECT_ID..."
    gcloud config set project "$PROJECT_ID"
    
    echo "Enabling required Google Cloud APIs..."
    gcloud services enable \
        cloudbuild.googleapis.com \
        run.googleapis.com \
        sqladmin.googleapis.com \
        secretmanager.googleapis.com \
        containerregistry.googleapis.com \
        artifactregistry.googleapis.com \
        compute.googleapis.com \
        servicenetworking.googleapis.com \
        iam.googleapis.com \
        --quiet
    
    echo -e "${GREEN}✅ APIs enabled${NC}\n"
}

setup_vpc_connector() {
    echo -e "${BLUE}[4/8]${NC} Setting up VPC Connector (for Cloud SQL access)...\n"
    
    # Check if connector already exists
    if gcloud compute networks vpc-access connectors describe discord-bot-connector \
        --region="$REGION" &> /dev/null; then
        echo "VPC Connector 'discord-bot-connector' already exists"
    else
        echo "Creating VPC Connector 'discord-bot-connector' in $REGION..."
        gcloud compute networks vpc-access connectors create discord-bot-connector \
            --region="$REGION" \
            --subnet=default \
            --machine-type=f1-micro \
            --min-throughput=200 \
            --max-throughput=1000 \
            --quiet || echo "VPC Connector creation in progress (may take a few minutes)"
    fi
    
    echo -e "${GREEN}✅ VPC Connector ready${NC}\n"
}

setup_cloud_sql() {
    echo -e "${BLUE}[5/8]${NC} Setting up Cloud SQL (PostgreSQL)...\n"
    
    # Check if instance exists
    if gcloud sql instances describe "$DB_INSTANCE_NAME" &> /dev/null; then
        echo "Cloud SQL instance '$DB_INSTANCE_NAME' already exists"
    else
        echo "Creating Cloud SQL instance '$DB_INSTANCE_NAME' in $REGION..."
        gcloud sql instances create "$DB_INSTANCE_NAME" \
            --database-version=POSTGRES_16 \
            --tier="$MACHINE_TYPE" \
            --region="$REGION" \
            --storage-type="$DISK_TYPE" \
            --storage-size="$DISK_SIZE" \
            --storage-auto-increase \
            --storage-auto-increase-limit=100 \
            --backup-start-time=03:00 \
            --retained-backups-count=7 \
            --enable-bin-log \
            --quiet
        
        echo "Waiting for Cloud SQL instance to be available (this may take a few minutes)..."
        gcloud sql operations wait --project="$PROJECT_ID" \
            $(gcloud sql operations list --instance="$DB_INSTANCE_NAME" \
                --limit=1 --format='value(name)') 2>/dev/null || true
    fi
    
    echo "Creating database '$DB_NAME'..."
    gcloud sql databases create "$DB_NAME" \
        --instance="$DB_INSTANCE_NAME" 2>/dev/null || \
        echo "Database '$DB_NAME' already exists"
    
    echo "Creating database user '$DB_USER'..."
    if gcloud sql users describe "$DB_USER" \
        --instance="$DB_INSTANCE_NAME" &> /dev/null; then
        echo "User '$DB_USER' already exists, updating password..."
        gcloud sql users set-password "$DB_USER" \
            --instance="$DB_INSTANCE_NAME" \
            --password="$DB_PASSWORD" 2>/dev/null || true
    else
        gcloud sql users create "$DB_USER" \
            --instance="$DB_INSTANCE_NAME" \
            --password="$DB_PASSWORD"
    fi
    
    echo "Retrieving connection information..."
    INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe "$DB_INSTANCE_NAME" \
        --format="value(connectionName)")
    PUBLIC_IP=$(gcloud sql instances describe "$DB_INSTANCE_NAME" \
        --format="value(ipAddresses[0].ipAddress)")
    
    # Database URL using public IP (Cloud Run can connect via VPC or public IP)
    DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$PUBLIC_IP:5432/$DB_NAME"
    
    echo -e "${GREEN}✅ Cloud SQL setup complete${NC}"
    echo "  Connection Name: $INSTANCE_CONNECTION_NAME"
    echo "  Public IP:       $PUBLIC_IP"
    echo ""
}

setup_service_account() {
    echo -e "${BLUE}[6/8]${NC} Setting up Service Account...\n"
    
    SERVICE_ACCOUNT="discord-bot@${PROJECT_ID}.iam.gserviceaccount.com"
    
    if gcloud iam service-accounts describe "$SERVICE_ACCOUNT" &> /dev/null; then
        echo "Service Account '$SERVICE_ACCOUNT' already exists"
    else
        echo "Creating Service Account 'discord-bot'..."
        gcloud iam service-accounts create discord-bot \
            --display-name="Discord Bot Service Account"
    fi
    
    echo "Granting necessary permissions..."
    
    # Cloud SQL Client
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/cloudsql.client" \
        --quiet
    
    # Artifact Registry Reader
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/artifactregistry.reader" \
        --quiet
    
    # Secret Accessor
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet
    
    echo -e "${GREEN}✅ Service Account configured${NC}\n"
}

setup_secrets() {
    echo -e "${BLUE}[7/8]${NC} Managing secrets in Secret Manager...\n"
    
    if [ "$TOKEN_SOURCE" = "1" ]; then
        echo "Creating DISCORD_TOKEN secret..."
        echo -n "$DISCORD_TOKEN" | gcloud secrets create DISCORD_TOKEN \
            --data-file=- 2>/dev/null || \
        (echo -n "$DISCORD_TOKEN" | \
            gcloud secrets versions add DISCORD_TOKEN --data-file=-)
    else
        echo "Using existing DISCORD_TOKEN secret in Secret Manager"
    fi
    
    echo "Creating DATABASE_URL secret..."
    echo -n "$DATABASE_URL" | gcloud secrets create DATABASE_URL \
        --data-file=- 2>/dev/null || \
    (echo -n "$DATABASE_URL" | \
        gcloud secrets versions add DATABASE_URL --data-file=-)
    
    echo -e "${GREEN}✅ Secrets configured${NC}\n"
}

build_and_push_image() {
    echo -e "${BLUE}[8/8]${NC} Building and pushing Docker image...\n"
    
    IMAGE_NAME="$DOCKER_REGISTRY/$PROJECT_ID/$SERVICE_NAME"
    
    echo "Building Docker image..."
    docker build -t "$IMAGE_NAME:latest" .
    
    echo "Configuring Docker authentication..."
    gcloud auth configure-docker "$DOCKER_REGISTRY"
    
    echo "Pushing image to Container Registry..."
    docker push "$IMAGE_NAME:latest"
    
    echo -e "${GREEN}✅ Docker image built and pushed${NC}\n"
}

deploy_cloud_run() {
    echo -e "${YELLOW}Deploying to Cloud Run...${NC}\n"
    
    SERVICE_ACCOUNT="discord-bot@${PROJECT_ID}.iam.gserviceaccount.com"
    IMAGE_NAME="$DOCKER_REGISTRY/$PROJECT_ID/$SERVICE_NAME:latest"
    
    gcloud run deploy "$SERVICE_NAME" \
        --image="$IMAGE_NAME" \
        --region="$REGION" \
        --platform=managed \
        --memory=512Mi \
        --cpu=1 \
        --timeout=3600 \
        --execution-environment=gen2 \
        --service-account="$SERVICE_ACCOUNT" \
        --update-secrets="DISCORD_TOKEN=DISCORD_TOKEN:latest,DATABASE_URL=DATABASE_URL:latest" \
        --update-env-vars="NODE_ENV=production,LOG_LEVEL=info,GCP_PROJECT_ID=$PROJECT_ID,CLOUD_SQL_CONNECTION_NAME=$INSTANCE_CONNECTION_NAME" \
        --vpc-connector="discord-bot-connector" \
        --vpc-egress="private-ranges-only" \
        --no-allow-unauthenticated \
        --min-instances=1 \
        --max-instances=10 \
        --quiet
    
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" --format="value(status.url)")
    
    echo -e "${GREEN}✅ Deployed to Cloud Run${NC}"
    echo "  Service URL: $SERVICE_URL"
    echo ""
}

print_post_deployment() {
    echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║           🎉 Deployment Complete! 🎉               ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}\n"
    
    echo -e "${YELLOW}Important Information:${NC}"
    echo "  • Service:     $SERVICE_NAME"
    echo "  • Region:      $REGION (Netherlands)"
    echo "  • Database:    Cloud SQL PostgreSQL in $REGION"
    echo "  • Auth:        Service Account: discord-bot"
    echo ""
    
    echo -e "${YELLOW}Useful Commands:${NC}"
    echo "  # View service details"
    echo "  gcloud run services describe $SERVICE_NAME --region=$REGION"
    echo ""
    echo "  # View logs"
    echo "  gcloud run logs read --service=$SERVICE_NAME --region=$REGION --limit=50"
    echo ""
    echo "  # Connect to logs (real-time)"
    echo "  gcloud run logs read --service=$SERVICE_NAME --region=$REGION --follow"
    echo ""
    echo "  # List secrets"
    echo "  gcloud secrets list"
    echo ""
    echo "  # Update secret"
    echo "  echo -n 'new-value' | gcloud secrets versions add SECRET_NAME --data-file=-"
    echo ""
    echo "  # Update Cloud Run service"
    echo "  gcloud run deploy $SERVICE_NAME --image=eu.gcr.io/$PROJECT_ID/$SERVICE_NAME:latest --region=$REGION"
    echo ""
    echo "  # Delete everything"
    echo "  gcloud run services delete $SERVICE_NAME --region=$REGION"
    echo "  gcloud sql instances delete $DB_INSTANCE_NAME"
    echo ""
    
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Monitor initial deployment in Cloud Run logs"
    echo "  2. Test bot functionality with Discord"
    echo "  3. Set up monitoring and alerts in Cloud Monitoring"
    echo "  4. Configure auto-backup for Cloud SQL (already enabled)"
    echo ""
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    check_prerequisites
    collect_configuration
    setup_gcp_project
    setup_vpc_connector
    setup_cloud_sql
    setup_service_account
    setup_secrets
    build_and_push_image
    deploy_cloud_run
    print_post_deployment
}

main "$@"
