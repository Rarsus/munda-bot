#!/bin/bash

# Discord Bot GCP Deployment Helper Script
# This script helps deploy the Discord bot to Google Cloud

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Discord Bot GCP Deployment Helper${NC}\n"

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    if ! command -v gcloud &> /dev/null; then
        echo -e "${RED}❌ gcloud CLI not found. Install from: https://cloud.google.com/sdk/docs/install${NC}"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker not found. Install from: https://docs.docker.com/get-docker/${NC}"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm not found. Install from: https://nodejs.org/${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ All prerequisites met${NC}\n"
}

# Get project configuration
get_config() {
    echo "Configure deployment..."
    
    read -p "Enter your GCP Project ID: " PROJECT_ID
    read -p "Enter Cloud Run region (default: us-central1): " REGION
    REGION=${REGION:-us-central1}
    
    read -p "Enter your Discord Bot Token: " DISCORD_TOKEN
    read -s -p "Enter PostgreSQL password: " DB_PASSWORD
    echo
    
    echo -e "${YELLOW}Configuration Summary:${NC}"
    echo "Project ID: $PROJECT_ID"
    echo "Region: $REGION"
    echo "Discord Token: ${DISCORD_TOKEN:0:10}...${DISCORD_TOKEN: -5}"
    echo ""
    
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
}

# Setup Google Cloud
setup_gcp() {
    echo -e "\n${YELLOW}Setting up Google Cloud Project...${NC}\n"
    
    # Set project
    gcloud config set project $PROJECT_ID
    
    # Enable required APIs
    echo "Enabling required APIs..."
    gcloud services enable \
        run.googleapis.com \
        cloudbuild.googleapis.com \
        sql.googleapis.com \
        secretmanager.googleapis.com \
        containerregistry.googleapis.com
    
    echo -e "${GREEN}✅ APIs enabled${NC}"
}

# Create Cloud SQL instance
setup_database() {
    echo -e "\n${YELLOW}Setting up Cloud SQL...${NC}\n"
    
    INSTANCE_NAME="discord-bot-db"
    
    # Check if instance exists
    if gcloud sql instances describe $INSTANCE_NAME &> /dev/null; then
        echo "Instance $INSTANCE_NAME already exists"
    else
        echo "Creating Cloud SQL instance..."
        gcloud sql instances create $INSTANCE_NAME \
            --database-version=POSTGRES_16 \
            --tier=db-f1-micro \
            --region=$REGION \
            --storage-type=SSD \
            --storage-size=10GB
        
        echo -e "${GREEN}✅ Cloud SQL instance created${NC}"
    fi
    
    # Create database
    echo "Creating database..."
    gcloud sql databases create discord_bot \
        --instance=$INSTANCE_NAME 2>/dev/null || echo "Database already exists"
    
    # Create user
    echo "Creating database user..."
    gcloud sql users create botuser \
        --instance=$INSTANCE_NAME \
        --password=$DB_PASSWORD 2>/dev/null || echo "User already exists"
    
    # Get connection string
    INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe $INSTANCE_NAME --format="value(connectionName)")
    PUBLIC_IP=$(gcloud sql instances describe $INSTANCE_NAME --format="value(ipAddresses[0].ipAddress)")
    
    DATABASE_URL="postgresql://botuser:$DB_PASSWORD@$PUBLIC_IP/discord_bot"
    
    echo -e "${GREEN}✅ Cloud SQL setup complete${NC}"
    echo "Connection Name: $INSTANCE_CONNECTION_NAME"
}

# Create secrets
setup_secrets() {
    echo -e "\n${YELLOW}Creating secrets in Secret Manager...${NC}\n"
    
    # Create Discord token secret
    echo -n "$DISCORD_TOKEN" | gcloud secrets create DISCORD_TOKEN \
        --data-file=- 2>/dev/null || gcloud secrets versions add DISCORD_TOKEN --data-file=-
    
    # Create database URL secret
    echo -n "$DATABASE_URL" | gcloud secrets create DATABASE_URL \
        --data-file=- 2>/dev/null || gcloud secrets versions add DATABASE_URL --data-file=-
    
    echo -e "${GREEN}✅ Secrets created${NC}"
}

# Build and push image
build_image() {
    echo -e "\n${YELLOW}Building Docker image...${NC}\n"
    
    IMAGE_NAME="gcr.io/$PROJECT_ID/discord-bot"
    
    docker build -t $IMAGE_NAME:latest .
    
    # Configure Docker auth for GCR
    gcloud auth configure-docker
    
    # Push to GCR
    docker push $IMAGE_NAME:latest
    
    echo -e "${GREEN}✅ Image pushed to ${IMAGE_NAME}${NC}"
}

# Deploy to Cloud Run
deploy_cloud_run() {
    echo -e "\n${YELLOW}Deploying to Cloud Run...${NC}\n"
    
    IMAGE_NAME="gcr.io/$PROJECT_ID/discord-bot:latest"
    
    gcloud run deploy discord-bot \
        --image=$IMAGE_NAME \
        --region=$REGION \
        --platform=managed \
        --memory=512Mi \
        --cpu=1 \
        --timeout=3600 \
        --no-allow-unauthenticated \
        --update-secrets=DISCORD_TOKEN=DISCORD_TOKEN:latest,DATABASE_URL=DATABASE_URL:latest
    
    SERVICE_URL=$(gcloud run services describe discord-bot --region=$REGION --format="value(status.url)")
    
    echo -e "${GREEN}✅ Deployed to Cloud Run${NC}"
    echo "Service URL: $SERVICE_URL"
}

# Main execution
main() {
    check_prerequisites
    get_config
    setup_gcp
    setup_database
    setup_secrets
    build_image
    deploy_cloud_run
    
    echo -e "\n${GREEN}🎉 Deployment complete!${NC}"
    echo -e "\n${YELLOW}Next steps:${NC}"
    echo "1. Check bot status: gcloud run services describe discord-bot --region=$REGION"
    echo "2. View logs: gcloud run logs read --service=discord-bot --region=$REGION"
    echo "3. Manage secrets: gcloud secrets list"
    echo ""
    echo "To delete everything:"
    echo "  gcloud run services delete discord-bot"
    echo "  gcloud sql instances delete discord-bot-db"
}

main "$@"