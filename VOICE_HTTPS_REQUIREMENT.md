# Voice Features HTTPS Requirement

## Issue

Voice input features (microphone access) require a **secure context** (HTTPS or localhost) to work. This is a browser security requirement enforced by all modern browsers.

**Error you'll see:**
```
Microphone access requires HTTPS. Please access via https:// or use localhost.
```

## Why This Happens

Browsers block `navigator.mediaDevices.getUserMedia()` on insecure HTTP connections to protect user privacy. This prevents malicious websites from secretly accessing your microphone/camera.

**Allowed:**
- ✅ `https://your-domain.com:3005` (HTTPS)
- ✅ `https://192.168.1.100:3005` (HTTPS)
- ✅ `http://localhost:3005` (localhost exception)
- ✅ `http://127.0.0.1:3005` (localhost exception)

**Blocked:**
- ❌ `http://192.168.1.100:3005` (HTTP on non-localhost)
- ❌ `http://pop-os-1:3005` (HTTP on non-localhost)
- ❌ `http://your-domain.com:3005` (HTTP)

## Solutions

### Option 1: SSH Port Forwarding (Quickest - No Setup)

Forward the port from your server to localhost on your machine:

```bash
# Forward port 3005 from your server to local port 3005
ssh -L 3005:localhost:3005 username@192.168.1.100

# Keep this SSH session open in the background
```

Then access the app via:
```
http://localhost:3005
```

This works because `localhost` is treated as a secure context by browsers.

**Pros:**
- No server configuration needed
- Works immediately
- No certificate management

**Cons:**
- Need to keep SSH session open
- Only works from one machine at a time
- Need to forward all ports (3005 for frontend, 8005 for backend, 8006 for terminal, 14300 for voice)

**Full command with all ports:**
```bash
ssh -L 3005:localhost:3005 \
    -L 8005:localhost:8005 \
    -L 8006:localhost:8006 \
    -L 14300:localhost:14300 \
    username@192.168.1.100
```

### Option 2: Self-Signed Certificate (Development)

Add HTTPS support with a self-signed certificate for development use.

#### Step 1: Generate Self-Signed Certificate on Server

```bash
# On your server (pop-os-1)
cd ~/claude-workflow-manager-deploy/claude-workflow-manager

# Generate certificate (valid for 365 days)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx-selfsigned.key \
  -out nginx-selfsigned.crt \
  -subj "/C=US/ST=State/L=City/O=Org/CN=192.168.1.100"
```

#### Step 2: Create Nginx Reverse Proxy

Create `docker-compose.nginx.yml`:

```yaml
services:
  nginx:
    image: nginx:alpine
    container_name: claude-workflow-nginx
    restart: always
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx-selfsigned.crt:/etc/nginx/ssl/cert.crt:ro
      - ./nginx-selfsigned.key:/etc/nginx/ssl/cert.key:ro
    networks:
      - claude-network
    depends_on:
      - frontend
```

#### Step 3: Create Nginx Configuration

Create `nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    # HTTPS server
    server {
        listen 443 ssl;
        server_name _;

        ssl_certificate /etc/nginx/ssl/cert.crt;
        ssl_certificate_key /etc/nginx/ssl/cert.key;

        # Frontend
        location / {
            proxy_pass http://frontend:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }

        # Backend API
        location /api/ {
            proxy_pass http://backend:8000/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Terminal WebSocket
        location /ws/ {
            proxy_pass http://claude-terminal:8006/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Voice API
        location /voice/ {
            proxy_pass http://voice-backend:8000/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
        }
    }
}
```

#### Step 4: Deploy with Nginx

```bash
docker compose -f docker-compose.yml \
               -f docker-compose.fast.yml \
               -f docker-compose.voice.yml \
               -f docker-compose.nginx.yml up -d
```

#### Step 5: Trust Certificate in Browser

Access `https://192.168.1.100` and accept the security warning (self-signed certificate).

**Pros:**
- Works from any machine on your network
- Closer to production setup
- All features work

**Cons:**
- Browser security warnings
- Need to manually trust certificate
- Certificate expires after 365 days

### Option 3: Let's Encrypt (Production)

For production deployments with a real domain name, use Let's Encrypt for free trusted certificates.

**Requirements:**
- Domain name pointing to your server
- Port 80 and 443 accessible from internet

**Setup with Certbot:**

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is set up automatically
```

**Pros:**
- Trusted by all browsers
- No security warnings
- Auto-renewal
- Free

**Cons:**
- Requires public domain
- Need internet-accessible server
- More complex setup

### Option 4: Browser Flag Override (NOT RECOMMENDED)

⚠️ **Security Risk:** Only use for testing, never in production.

Chrome/Edge:
```bash
# Windows
chrome.exe --unsafely-treat-insecure-origin-as-secure="http://192.168.1.100:3005" --user-data-dir=C:\temp\chrome-test

# Linux
google-chrome --unsafely-treat-insecure-origin-as-secure="http://192.168.1.100:3005" --user-data-dir=/tmp/chrome-test
```

## Recommended Solution by Use Case

| Use Case | Recommended Solution | Why |
|----------|---------------------|-----|
| **Quick Testing** | SSH Port Forwarding | No setup, works immediately |
| **Team Development** | Self-Signed Certificate | Everyone on network can access |
| **Production** | Let's Encrypt | Trusted, secure, no warnings |
| **No Other Option** | Browser Flag | Last resort, security risk |

## Verification

After implementing HTTPS, verify it works:

1. Open browser developer console (F12)
2. Go to Console tab
3. Type: `navigator.mediaDevices.getUserMedia({ audio: true })`
4. If it prompts for microphone permission, HTTPS is working correctly

## Additional Resources

- [MDN Web Docs: Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)
- [WebRTC Security](https://webrtc-security.github.io/)
- [Let's Encrypt Documentation](https://letsencrypt.org/getting-started/)

