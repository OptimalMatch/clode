# Deployment Guide

This guide covers both local development setup and production deployment of the Claude Workflow Manager.

## 🏠 Local Development Setup

For local development with hot reload and live code changes:

### Quick Start
```bash
# Navigate to the project directory
cd claude-workflow-manager

# Run the development setup script
./dev-setup.sh
```

### Manual Setup
```bash
# Create .env file (if not exists)
cp .env.dev .env
# Edit .env and add your CLAUDE_API_KEY

# Start development services
docker-compose -f docker-compose.dev.yml up --build -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f
```

### Development URLs
- **Frontend**: http://localhost:3000 (with hot reload)
- **Backend**: http://localhost:8000
- **MongoDB**: localhost:27017
- **Redis**: localhost:6379

### Development Features
- ✅ **Hot Reload**: Frontend code changes update automatically
- ✅ **Live Backend Reload**: Backend changes restart automatically
- ✅ **Volume Mounts**: Code changes reflected immediately
- ✅ **Development Ports**: Standard development ports (3000, 8000)

### Stopping Development Environment
```bash
docker-compose -f docker-compose.dev.yml down
```

---

## 🚀 Production Deployment

This section covers deploying the Claude Workflow Manager to your self-hosted runner using GitHub Actions.

## Prerequisites

### Self-Hosted Runner Setup

Your self-hosted runner must have:

1. **Docker Engine** (version 20.10+)
2. **Docker Compose** (version 2.0+)
3. **At least 2GB free disk space**
4. **Network access** to GitHub and Docker Hub

### GitHub Secrets Configuration

Configure the following secrets in your GitHub repository:

| Secret Name | Description | Required | Default |
|-------------|-------------|----------|---------|
| `CLAUDE_API_KEY` | Your Claude API key from Anthropic | ✅ Yes | - |
| `MONGO_USERNAME` | MongoDB root username | ❌ Optional | `` |
| `MONGO_PASSWORD` | MongoDB root password | ❌ Optional | `` |
| `HOST_IP` | Host IP for frontend URLs | ❌ Optional | `localhost` |

#### Setting Up GitHub Secrets

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each required secret:

```bash
CLAUDE_API_KEY=sk-ant-your-actual-claude-api-key-here
```

## Deployment Process

### Automatic Deployment

The deployment automatically triggers on:

- **Push to `main` branch** - Deploys to production
- **Push to `develop` branch** - Deploys to staging
- **Pull Request to `main`** - Validation deployment
- **Manual trigger** - Choose environment

### Manual Deployment

1. Go to **Actions** tab in your repository
2. Select **Deploy to Self-Hosted Runner** workflow
3. Click **Run workflow**
4. Choose deployment environment:
   - `production` - Live deployment
   - `staging` - Testing environment  
   - `development` - Development build

### Deployment Steps

The GitHub Action performs these steps:

1. **System Verification** - Checks Docker, disk space, etc.
2. **Backup Creation** - Backs up current deployment (keeps last 5)
3. **Service Shutdown** - Gracefully stops existing containers
4. **Code Deployment** - Copies new code to `/opt/claude-workflow-manager`
5. **Environment Setup** - Creates `.env` with secrets
6. **Container Build** - Builds new Docker images
7. **Service Startup** - Starts all services with health checks
8. **Smoke Tests** - Verifies all endpoints are working
9. **Cleanup** - Removes old Docker images/containers

## Service Architecture

### Services and Ports

| Service | Internal Port | External Port | Purpose |
|---------|---------------|---------------|---------|
| Frontend | 3000 | 3005 | React web interface |
| Backend | 8000 | 8005 | FastAPI REST API |
| MongoDB | 27017 | 27018 | Database storage |
| Redis | 6379 | 6379 | Caching and sessions |

### File Structure

```
$HOME/claude-workflow-manager-deploy/
├── claude-workflow-manager/     # Current deployment
├── backups/                     # Backup history
│   ├── backup_20240101_120000/  # Timestamped backups
│   └── ...
└── .env                         # Environment configuration
```

## Health Monitoring

### Health Check Endpoints

- **Basic**: `http://localhost:8005/` - Simple API status
- **Detailed**: `http://localhost:8005/health` - Full system health

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "services": {
    "api": "healthy",
    "database": "healthy", 
    "claude_manager": "healthy"
  },
  "version": {
    "deployment_env": "production",
    "deployment_time": "20240101_120000",
    "git_sha": "abcd1234",
    "branch": "main"
  },
  "active_instances": 0
}
```

## Troubleshooting

### Common Issues

#### 1. Docker Permission Denied

```bash
# Add user to docker group
sudo usermod -aG docker $USER
# Logout and login again
```

#### 2. Port Already in Use

```bash
# Check what's using the port
sudo lsof -i :8005
# Kill the process or change ports in docker-compose.yml
```

#### 3. MongoDB Connection Failed

```bash
# Check MongoDB container logs
docker-compose logs mongodb
# Verify environment variables
cat .env
```

#### 4. Insufficient Disk Space

```bash
# Clean up Docker
docker system prune -f
# Remove old images
docker image prune -a
```

### Viewing Logs

```bash
# All services
cd /opt/claude-workflow-manager/claude-workflow-manager
docker-compose logs

# Specific service
docker-compose logs backend
docker-compose logs frontend
docker-compose logs mongodb

# Follow logs in real-time
docker-compose logs -f backend
```

### Manual Recovery

If deployment fails, the system automatically attempts recovery:

1. **Automatic Rollback** - Restores from latest backup
2. **Manual Rollback**:
   ```bash
   cd $HOME/claude-workflow-manager-deploy
   # List available backups
   ls -la backups/
   # Restore specific backup
   rm -rf claude-workflow-manager
   cp -r backups/backup_TIMESTAMP/claude-workflow-manager .
   cd claude-workflow-manager
   docker compose up -d
   ```

### Service Management

```bash
cd $HOME/claude-workflow-manager-deploy/claude-workflow-manager

# Start services
docker compose up -d

# Stop services  
docker compose down

# Restart specific service
docker compose restart backend

# View service status
docker compose ps

# Scale services (if needed)
docker compose up -d --scale backend=2
```

## Maintenance

### Regular Tasks

1. **Monitor disk usage**: Check `/opt/claude-workflow-manager`
2. **Review logs**: Look for errors or performance issues
3. **Update dependencies**: Rebuild containers monthly
4. **Backup verification**: Test backup restoration quarterly

### Updates

New deployments automatically:
- Create backups before updating
- Update all containers with latest code
- Run health checks after deployment
- Clean up old Docker resources

### Security

- SSH keys stored in `/app/ssh_keys` (container-local)
- Environment secrets managed via GitHub Secrets
- MongoDB credentials configurable via environment
- Logs contain no sensitive information

## Monitoring URLs

After successful deployment:

- **Frontend**: http://localhost:3005
- **Backend API**: http://localhost:8005
- **API Documentation**: http://localhost:8005/docs
- **Health Check**: http://localhost:8005/health

## Support

For deployment issues:
1. Check GitHub Actions logs
2. Review service logs: `docker-compose logs`
3. Verify health endpoints
4. Check disk space and Docker status
