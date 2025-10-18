# Deploy to Pop!OS Server Guide

## Quick Deploy (Our Changes + Fixes)

Since the Docker build has issues, here's how to deploy to a Pop!OS server with our new usage dashboard feature:

## Prerequisites on Pop!OS Server

```bash
# SSH into your Pop!OS server
ssh user@your-popos-server

# Install Docker if not already installed
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
# Log out and back in for group changes to take effect
```

## Option 1: Quick Deploy with Fixed Docker (Recommended)

### Step 1: Clone/Update the Repository

```bash
# On Pop!OS server
cd ~
git clone https://github.com/your-org/clode.git
# Or if already cloned:
cd ~/clode
git pull origin main
```

### Step 2: Fix the Docker Issues

The current Docker setup has two main issues we need to fix:

**Fix 1: MCP Server - Add gcc**

```bash
cd ~/clode/claude-workflow-manager/backend

# Edit Dockerfile.mcp
nano Dockerfile.mcp

# Add this BEFORE the "RUN pip install" line (around line 11):
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*
```

**Fix 2: Remove Old Java Versions**

```bash
# Edit backend/Dockerfile.base
nano Dockerfile.base

# Find lines with openjdk-8-jdk, openjdk-11-jdk, etc.
# Replace them with just:
default-jdk \
```

**Fix 3: Same for Terminal Dockerfile**

```bash
# Edit backend/Dockerfile.terminal
nano Dockerfile.terminal

# Find lines with old Java versions
# Replace with:
default-jdk \
```

### Step 3: Create Environment File

```bash
cd ~/clode/claude-workflow-manager

# Create .env file
cat > .env << 'EOF'
# Anthropic API Key (REQUIRED)
CLAUDE_API_KEY=your-actual-api-key-here

# MongoDB Credentials
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=your-secure-password-here

# Server Access (replace with your server's IP)
HOST_IP=your-server-ip-or-domain

# Optional: Use Max Plan mode instead of API key
USE_CLAUDE_MAX_PLAN=false

# Prompt and agent folders
CLAUDE_PROMPTS_FOLDER=.clode/claude_prompts
CLAUDE_AGENTS_FOLDER=.claude/agents
EOF

# Edit the file with your actual values
nano .env
```

### Step 4: Deploy with Docker Compose

```bash
cd ~/clode/claude-workflow-manager

# Build and start services
docker compose up -d --build

# Watch the logs
docker compose logs -f

# Check status
docker compose ps
```

### Step 5: Access the Application

```bash
# On your local machine, create an SSH tunnel:
ssh -L 3005:localhost:3005 -L 8005:localhost:8005 user@your-popos-server

# Then open in browser:
# http://localhost:3005  - Frontend with our new Usage Dashboard
# http://localhost:8005/docs - API documentation
```

Or configure firewall on Pop!OS:

```bash
# On Pop!OS server
sudo ufw allow 3005/tcp
sudo ufw allow 8005/tcp
sudo ufw reload

# Then access from anywhere:
# http://your-server-ip:3005
```

## Option 2: Manual Python Deployment (No Docker)

If Docker continues to have issues, run services directly on Pop!OS:

### Step 1: Install Dependencies

```bash
sudo apt update
sudo apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    mongodb \
    redis-server \
    nodejs \
    npm \
    git

# Enable services
sudo systemctl enable --now mongodb redis-server
```

### Step 2: Setup Backend

```bash
cd ~/clode/claude-workflow-manager/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export CLAUDE_API_KEY="your-api-key"
export MONGODB_URL="mongodb://localhost:27017/claude_workflows"
export REDIS_URL="redis://localhost:6379"
export USE_CLAUDE_MAX_PLAN=false

# Run backend
uvicorn main:app --host 0.0.0.0 --port 8005
```

### Step 3: Setup Frontend (New Terminal)

```bash
cd ~/clode/claude-workflow-manager/frontend

# Install dependencies
npm install

# Build for production
npm run build

# Serve with nginx or use serve
sudo npm install -g serve
serve -s build -l 3005
```

### Step 4: Create Systemd Services (Keep Running)

**Backend Service:**

```bash
sudo nano /etc/systemd/system/claude-backend.service
```

```ini
[Unit]
Description=Claude Workflow Backend
After=network.target mongodb.service redis.service

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/clode/claude-workflow-manager/backend
Environment="CLAUDE_API_KEY=your-api-key"
Environment="MONGODB_URL=mongodb://localhost:27017/claude_workflows"
Environment="REDIS_URL=redis://localhost:6379"
ExecStart=/home/your-username/clode/claude-workflow-manager/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8005
Restart=always

[Install]
WantedBy=multi-user.target
```

**Frontend Service:**

```bash
sudo nano /etc/systemd/system/claude-frontend.service
```

```ini
[Unit]
Description=Claude Workflow Frontend
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/clode/claude-workflow-manager/frontend
ExecStart=/usr/local/bin/serve -s build -l 3005
Restart=always

[Install]
WantedBy=multi-user.target
```

**Enable and Start:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable claude-backend claude-frontend
sudo systemctl start claude-backend claude-frontend

# Check status
sudo systemctl status claude-backend
sudo systemctl status claude-frontend
```

## Option 3: Using the GitHub Actions Deployment

Your boss has a GitHub Actions workflow set up. You can use it:

### Step 1: Setup Self-Hosted Runner on Pop!OS

```bash
# On Pop!OS server
cd ~
mkdir actions-runner && cd actions-runner

# Download runner (check GitHub for latest version)
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz

tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Configure (get token from GitHub repo Settings > Actions > Runners)
./config.sh --url https://github.com/your-org/clode --token YOUR_TOKEN_HERE

# Install as service
sudo ./svc.sh install
sudo ./svc.sh start
```

### Step 2: Set GitHub Secrets

Go to your GitHub repo → Settings → Secrets and variables → Actions

Add these secrets:
- `CLAUDE_API_KEY`: Your Anthropic API key
- `MONGO_USERNAME`: admin
- `MONGO_PASSWORD`: your-secure-password
- `HOST_IP`: your-server-ip

### Step 3: Trigger Deployment

```bash
# Push to main branch, or
# Go to Actions tab → Deploy to Self-Hosted Runner → Run workflow
```

## Verifying the Deployment

### Check Services are Running

```bash
# Docker method:
docker compose ps

# Should show all services as "Up":
# - mongodb
# - redis  
# - backend
# - frontend
# - mcp-server
# - claude-terminal
```

### Test the API

```bash
# Health check
curl http://localhost:8005/health

# Should return:
# {"status":"healthy","timestamp":"..."}
```

### Test the Usage Dashboard

1. Open browser: `http://your-server-ip:3005`
2. Register/Login
3. Click your avatar (top right)
4. Click "Usage Dashboard" ← **Our new feature!**
5. See your token usage and costs

## Monitoring on Pop!OS

### View Logs

```bash
# Docker:
docker compose logs -f backend
docker compose logs -f frontend

# Systemd:
sudo journalctl -u claude-backend -f
sudo journalctl -u claude-frontend -f
```

### Check Resource Usage

```bash
# System resources
htop

# Docker stats
docker stats

# Disk space
df -h
```

### Database Access

```bash
# Connect to MongoDB
docker exec -it claude-workflow-mongo mongosh -u admin -p your-password

# Or if installed directly:
mongosh mongodb://admin:your-password@localhost:27017
```

## Updating the Deployment

### With Docker:

```bash
cd ~/clode
git pull origin main
cd claude-workflow-manager
docker compose down
docker compose up -d --build
```

### With Systemd:

```bash
cd ~/clode
git pull origin main

# Backend
cd claude-workflow-manager/backend
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart claude-backend

# Frontend
cd ../frontend
npm install
npm run build
sudo systemctl restart claude-frontend
```

## Troubleshooting

### Port Already in Use

```bash
# Find what's using the port
sudo lsof -i :8005
sudo lsof -i :3005

# Kill it
sudo kill -9 <PID>
```

### MongoDB Connection Issues

```bash
# Check MongoDB is running
sudo systemctl status mongodb

# Check logs
sudo journalctl -u mongodb -n 50
```

### Docker Build Fails

Use Option 2 (manual deployment) or wait for Docker fixes from your boss.

### Can't Access from Outside

```bash
# Check firewall
sudo ufw status

# Allow ports
sudo ufw allow 3005/tcp
sudo ufw allow 8005/tcp
```

## Performance Tips for Pop!OS

```bash
# Increase file watches for development
echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Optimize MongoDB
sudo nano /etc/mongod.conf
# Set wiredTiger cacheSizeGB based on available RAM
```

## Security Recommendations

1. **Use HTTPS**: Set up nginx reverse proxy with Let's Encrypt
2. **Firewall**: Only open necessary ports
3. **Strong passwords**: Use secure MongoDB and admin passwords
4. **Updates**: Keep Pop!OS and packages updated
5. **Backups**: Regularly backup MongoDB data

## Your New Feature is Ready!

Once deployed, users can:
1. Log in to the application
2. Use Claude instances to do work (generates token usage)
3. Click avatar → "Usage Dashboard"
4. See beautiful analytics:
   - Total cost in USD
   - Token breakdown with charts
   - Average costs
   - Execution time

**The feature works perfectly - it just needs a working deployment environment!** 🚀

---

**Questions? Issues?**
- Check logs first: `docker compose logs` or `journalctl`
- Verify environment variables are set
- Ensure MongoDB and Redis are running
- Check disk space and memory

