# Image Processing Backend - Deployment Guide

This guide explains how to deploy the Image Processing Backend with secure Google Cloud credentials management using GitHub Actions secrets.

## Prerequisites

1. **Google Cloud Vision API Setup**
   - Create a Google Cloud Project
   - Enable the Cloud Vision API
   - Create a service account with Vision API permissions
   - Download the service account JSON credentials

2. **GitHub Repository Access**
   - Admin access to the repository to add secrets

## Setting Up GitHub Secrets

### 1. Prepare Google Cloud Credentials

First, get your Google Cloud credentials JSON file. It should look like this:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "service-account@project.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

### 2. Add Secret to GitHub

#### Using GitHub Web UI:

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `GOOGLE_CLOUD_CREDENTIALS`
5. Value: Paste the entire contents of your `google-credentials.json` file
6. Click **Add secret**

#### Using GitHub CLI:

```bash
# From your local machine
cd /path/to/clode

# Read the credentials file and create the secret
gh secret set GOOGLE_CLOUD_CREDENTIALS < /path/to/google-credentials.json

# Verify the secret was created
gh secret list | grep GOOGLE_CLOUD_CREDENTIALS
```

### 3. Verify Secret Configuration

Check that the secret is properly configured:

```bash
gh secret list
```

You should see `GOOGLE_CLOUD_CREDENTIALS` in the list.

## How It Works

### GitHub Actions Workflow

When you push to `main` or trigger a deployment:

1. **Deployment workflow** (`deploy-self-hosted.yml`) checks if `GOOGLE_CLOUD_CREDENTIALS` secret exists
2. If it exists:
   - Copies the `image-backend` and `image-mcp-server` directories to deployment location
   - Creates `google-credentials.json` file from the secret
   - Includes `docker-compose.image.yml` in the deployment
3. Docker Compose mounts the credentials file into the container at runtime
4. Services start with image processing capabilities enabled

### Credential File Flow

```
GitHub Secret (GOOGLE_CLOUD_CREDENTIALS)
    ↓
GitHub Actions creates google-credentials.json in deployment directory
    ↓
Docker Compose mounts ./google-credentials.json → /app/google-credentials.json
    ↓
Image Backend uses credentials to access Google Cloud Vision API
```

## Security Best Practices

### ✅ Do's

- **Store credentials in GitHub Secrets** - Never commit to repository
- **Use service accounts** - Create dedicated service account for Vision API
- **Principle of least privilege** - Grant only Vision API permissions needed
- **Rotate credentials regularly** - Update the secret when rotating service accounts
- **Use read-only mounts** - Container mounts credentials as read-only (`:ro`)

### ❌ Don'ts

- **Never commit google-credentials.json** - Already in `.gitignore`
- **Don't share credentials** - Each environment should have its own service account
- **Don't use personal credentials** - Always use service accounts
- **Don't log credentials** - The workflow masks the secret value

## Local Development

For local development, you'll need to provide credentials manually:

### Option 1: Environment Variable

```bash
cd claude-workflow-manager

# Create credentials file locally (gitignored)
cat > google-credentials.json << 'EOF'
{
  "type": "service_account",
  ...
}
EOF

# Start services
docker-compose -f docker-compose.yml -f docker-compose.image.yml up
```

### Option 2: Development Override

Create a `docker-compose.override.yml`:

```yaml
services:
  image-backend:
    volumes:
      - /path/to/your/google-credentials.json:/app/google-credentials.json:ro
```

Then run:

```bash
docker-compose -f docker-compose.yml -f docker-compose.image.yml up
```

## Deployment

### Automatic Deployment (CI/CD)

Image processing services are automatically deployed when:

1. You push to `main` branch
2. `GOOGLE_CLOUD_CREDENTIALS` secret is configured
3. GitHub Actions workflow completes successfully

Check deployment status:

```bash
# View recent workflow runs
gh run list --limit 5

# Watch a deployment in real-time
gh run watch

# View deployment logs
gh run view <run-id> --log
```

### Manual Deployment

If deploying manually to a self-hosted runner:

```bash
# SSH to your deployment server
ssh user@your-server

# Navigate to deployment directory
cd ~/claude-workflow-manager-deploy/claude-workflow-manager

# Create credentials file from secret
# (You'll need to copy the credentials content manually)
cat > google-credentials.json << 'EOF'
{paste credentials here}
EOF

# Deploy with image services
docker-compose -f docker-compose.yml -f docker-compose.image.yml up -d
```

## Verification

### Check Service Health

```bash
# Image Backend API
curl http://localhost:14400/health

# Expected response:
# {"status":"healthy","vision_ready":true}
```

### Test OCR Functionality

```bash
# Test with a sample image URL
curl -X POST http://localhost:14400/api/ocr/url \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/sample-image.jpg"
  }'
```

### Check Docker Logs

```bash
cd ~/claude-workflow-manager-deploy/claude-workflow-manager

# View image backend logs
docker-compose logs -f image-backend

# View MCP server logs
docker-compose logs -f image-mcp-server
```

## Troubleshooting

### Secret Not Found Error

**Symptom:** Deployment skips image services with message "Image processing services will be skipped (no Google credentials)"

**Solution:**
1. Verify secret exists: `gh secret list | grep GOOGLE_CLOUD_CREDENTIALS`
2. Check secret name is exactly `GOOGLE_CLOUD_CREDENTIALS` (case-sensitive)
3. Re-create the secret if needed: `gh secret set GOOGLE_CLOUD_CREDENTIALS < credentials.json`

### Vision API Authentication Error

**Symptom:** Backend logs show "Could not authenticate with Google Cloud Vision API"

**Solution:**
1. Verify credentials JSON is valid
2. Check service account has Vision API enabled
3. Ensure credentials file is properly mounted (check with `docker exec`)
4. Verify no JSON formatting errors in the secret

### Container Can't Read Credentials

**Symptom:** Error "google-credentials.json not found" in backend logs

**Solution:**
```bash
# Check if file exists in deployment directory
ls -la ~/claude-workflow-manager-deploy/claude-workflow-manager/google-credentials.json

# Verify mount in container
docker exec claude-workflow-image-backend ls -la /app/google-credentials.json

# Check permissions
docker exec claude-workflow-image-backend cat /app/google-credentials.json
```

### API Quota Exceeded

**Symptom:** "Quota exceeded for quota metric 'Vision API requests' and limit 'Vision API requests per day'"

**Solution:**
1. Check your Google Cloud Console for quota limits
2. Request quota increase if needed
3. Implement rate limiting in your application
4. Consider upgrading your Google Cloud plan

## Service URLs

After successful deployment, services are available at:

- **Image Backend API**: `http://{HOST_IP}:14400`
- **Image MCP Server (HTTP)**: `http://{HOST_IP}:14402`
- **API Documentation**: `http://{HOST_IP}:14400/docs` (FastAPI auto-generated)

## Updating Credentials

To rotate or update Google Cloud credentials:

```bash
# Update the GitHub secret
gh secret set GOOGLE_CLOUD_CREDENTIALS < new-google-credentials.json

# Trigger a new deployment
git commit --allow-empty -m "Rotate Google Cloud credentials"
git push origin main

# Or manually trigger the workflow
gh workflow run deploy-self-hosted.yml
```

## Cost Considerations

**Google Cloud Vision API Pricing** (as of 2024):
- First 1,000 units/month: Free
- OCR: $1.50 per 1,000 images after free tier
- Document Text Detection: $1.50 per 1,000 pages

Monitor usage in Google Cloud Console to avoid unexpected charges.

## Additional Resources

- [Google Cloud Vision API Documentation](https://cloud.google.com/vision/docs)
- [Service Account Best Practices](https://cloud.google.com/iam/docs/best-practices-service-accounts)
- [GitHub Actions Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
