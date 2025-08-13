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

# Set up SSH configuration
RUN mkdir -p /root/.ssh && \
    chmod 700 /root/.ssh && \
    ssh-keyscan -H github.com >> /root/.ssh/known_hosts && \
    ssh-keyscan -H gitlab.com >> /root/.ssh/known_hosts && \
    ssh-keyscan -H bitbucket.org >> /root/.ssh/known_hosts && \
    chmod 644 /root/.ssh/known_hosts

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create src directory for development volume mounting
RUN mkdir -p /app/src

# Set Python path to include both /app and /app/src
ENV PYTHONPATH="/app:/app/src:${PYTHONPATH}"

EXPOSE 8000

# Use the main module from the src directory for development
CMD ["sh", "-c", "if [ -f /app/src/main.py ]; then cd /app/src && uvicorn main:app --host 0.0.0.0 --port 8000 --reload; else uvicorn main:app --host 0.0.0.0 --port 8000 --reload; fi"]