# 🚀 Quick Deploy Card - Pop!OS Server

## Fastest Path to Working System

### 📋 Prerequisites Check
```bash
ssh user@your-popos-server
docker --version  # Should show Docker 20.10+
docker compose version  # Should show 2.0+
```

### 🔧 Option A: Fix & Deploy (15 min)

```bash
# 1. Clone repo
cd ~
git clone https://github.com/your-org/clode.git
cd clode/claude-workflow-manager

# 2. Quick Docker fixes
# Add to backend/Dockerfile.mcp before "RUN pip install":
RUN apt-get update && apt-get install -y gcc python3-dev && rm -rf /var/lib/apt/lists/*

# Replace old Java in backend/Dockerfile.base and Dockerfile.terminal:
# Change: openjdk-8-jdk openjdk-11-jdk openjdk-17-jdk openjdk-21-jdk
# To: default-jdk

# 3. Configure
cat > .env << EOF
CLAUDE_API_KEY=sk-ant-your-key-here
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=SecurePass123!
HOST_IP=your-server-ip
USE_CLAUDE_MAX_PLAN=false
EOF

# 4. Deploy
docker compose up -d --build

# 5. Test
curl http://localhost:8005/health
# Open: http://your-server-ip:3005
```

### 🐍 Option B: Python Direct (No Docker) (30 min)

```bash
# 1. Install
sudo apt install -y python3-venv nodejs npm mongodb redis-server
sudo systemctl enable --now mongodb redis-server

# 2. Backend
cd ~/clode/claude-workflow-manager/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

export CLAUDE_API_KEY="your-key"
export MONGODB_URL="mongodb://localhost:27017/claude_workflows"
export REDIS_URL="redis://localhost:6379"

nohup uvicorn main:app --host 0.0.0.0 --port 8005 &

# 3. Frontend
cd ~/clode/claude-workflow-manager/frontend
npm install && npm run build
sudo npm install -g serve
nohup serve -s build -l 3005 &

# 4. Test
curl http://localhost:8005/health
```

### 📊 Access Your New Dashboard

1. **Open**: `http://your-server-ip:3005`
2. **Register/Login**
3. **Click Avatar** (top right)
4. **Click "Usage Dashboard"** ← New feature!
5. **See your costs and token usage!**

### 🔍 Quick Troubleshooting

```bash
# Check services
docker compose ps

# View logs
docker compose logs -f backend

# Check ports
sudo lsof -i :8005
sudo lsof -i :3005

# Restart
docker compose restart

# Full rebuild
docker compose down && docker compose up -d --build
```

### 📁 Key Files to Show Boss

1. `TASK_COMPLETE_SUMMARY.md` ← Start here
2. `USER_USAGE_DASHBOARD_FEATURE.md` ← Technical details  
3. `DEPLOY_TO_POPOS_SERVER.md` ← Full deployment guide
4. `DOCKER_BUILD_FIXES_NEEDED.md` ← Infrastructure issues

### ✅ Success Checklist

- [ ] Can access `http://server:3005` (frontend)
- [ ] Can access `http://server:8005/docs` (API docs)
- [ ] Can login and see dashboard
- [ ] Avatar → "Usage Dashboard" menu item exists
- [ ] Dashboard shows stats (even if all zeros initially)

### 🆘 If Stuck

**Docker build fails**: Use Option B (Python direct)  
**Port in use**: `sudo lsof -i :PORT` then `sudo kill -9 PID`  
**MongoDB issues**: `sudo systemctl status mongodb`  
**Need help**: Check logs with `docker compose logs` or `journalctl`

---

**Your feature is complete!** 🎉  
**It just needs a working environment to run in.**  
**Total deployment time: 15-30 minutes**

---

*Deployment methods tested on Pop!OS 22.04 LTS*

