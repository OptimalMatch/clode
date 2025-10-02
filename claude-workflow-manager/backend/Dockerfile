FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    curl \
    openssh-client \
    nodejs \
    npm \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# Install Docker
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
RUN echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
RUN apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user for better security
RUN useradd -m -s /bin/bash claude

# Add claude user to docker group for Docker access
RUN usermod -aG docker claude

# Set up SSH configuration for claude user
RUN mkdir -p /home/claude/.ssh && \
    chmod 700 /home/claude/.ssh && \
    ssh-keyscan -H github.com >> /home/claude/.ssh/known_hosts && \
    ssh-keyscan -H gitlab.com >> /home/claude/.ssh/known_hosts && \
    ssh-keyscan -H bitbucket.org >> /home/claude/.ssh/known_hosts && \
    chmod 644 /home/claude/.ssh/known_hosts && \
    chown -R claude:claude /home/claude/.ssh

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create src and project directories for development volume mounting
RUN mkdir -p /app/src /app/project

# Change ownership of app directory to claude user
RUN chown -R claude:claude /app

# Create claude's .claude directory and SSH keys directory
RUN mkdir -p /home/claude/.claude && \
    mkdir -p /app/ssh_keys && \
    chown -R claude:claude /home/claude/.claude && \
    chown -R claude:claude /app/ssh_keys

# Set Python path to include both /app and /app/src
ENV PYTHONPATH="/app:/app/src:${PYTHONPATH}"

# Create Docker-in-Docker startup script as root
RUN echo '#!/bin/bash\n\
# Start Docker daemon in background if not already running\n\
if ! pgrep dockerd > /dev/null; then\n\
    sudo dockerd --host=unix:///var/run/docker.sock --host=tcp://0.0.0.0:2376 --tlsverify --tlscacert=/certs/ca/ca.pem --tlscert=/certs/server/cert.pem --tlskey=/certs/server/key.pem &\n\
fi\n\
# Wait for Docker daemon to be ready\n\
while ! docker info > /dev/null 2>&1; do\n\
    echo "Waiting for Docker daemon to start..."\n\
    sleep 2\n\
done\n\
echo "Docker daemon is ready"\n\
# Start the main application\n\
if [ -f /app/src/main.py ]; then\n\
    cd /app/src && uvicorn main:app --host 0.0.0.0 --port 8000 --reload\n\
else\n\
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload\n\
fi' > /app/start.sh && chmod +x /app/start.sh

# Install sudo and configure passwordless sudo for claude user for Docker daemon
RUN apt-get update && apt-get install -y sudo && rm -rf /var/lib/apt/lists/* && \
    echo 'claude ALL=(ALL) NOPASSWD: /usr/bin/dockerd' >> /etc/sudoers

# Switch to claude user for runtime
USER claude

EXPOSE 8000

# Use the startup script
CMD ["/app/start.sh"]