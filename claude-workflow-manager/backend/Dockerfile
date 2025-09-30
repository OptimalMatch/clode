# Multi-stage build for better caching and smaller images
FROM python:3.11-slim as base

# Use faster mirrors and optimize package installation
RUN echo "deb http://deb.debian.org/debian trixie main" > /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian trixie-updates main" >> /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian-security trixie-security main" >> /etc/apt/sources.list

# Install system dependencies in one layer
RUN apt-get update --fix-missing && \
    apt-get install -y --no-install-recommends \
    git \
    curl \
    openssh-client \
    nodejs \
    npm \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install Claude Code CLI globally with better error handling
RUN npm config set registry https://registry.npmjs.org/ && \
    npm install -g @anthropic-ai/claude-code --timeout=60000 || \
    (echo "⚠️ Claude CLI installation failed, will retry at runtime" && exit 0)

# Python dependencies stage
FROM base as python-deps
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Final stage
FROM base as final
WORKDIR /app

# Copy Python dependencies from previous stage
COPY --from=python-deps /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Create non-root user for better security
RUN useradd -m -s /bin/bash claude

# Set up SSH configuration for claude user
RUN mkdir -p /home/claude/.ssh && \
    chmod 700 /home/claude/.ssh && \
    ssh-keyscan -H github.com >> /home/claude/.ssh/known_hosts && \
    ssh-keyscan -H gitlab.com >> /home/claude/.ssh/known_hosts && \
    ssh-keyscan -H bitbucket.org >> /home/claude/.ssh/known_hosts && \
    chmod 644 /home/claude/.ssh/known_hosts && \
    chown -R claude:claude /home/claude/.ssh

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

# Switch to claude user for runtime
USER claude

EXPOSE 8000

# Use the main module from the src directory for development
CMD ["sh", "-c", "if [ -f /app/src/main.py ]; then cd /app/src && uvicorn main:app --host 0.0.0.0 --port 8000 --reload; else uvicorn main:app --host 0.0.0.0 --port 8000 --reload; fi"]