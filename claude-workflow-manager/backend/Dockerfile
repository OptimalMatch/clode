FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    curl \
    openssh-client \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

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

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create src directory for development volume mounting
RUN mkdir -p /app/src

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