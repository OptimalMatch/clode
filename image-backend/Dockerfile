FROM python:3.10-slim

WORKDIR /app

# Install system dependencies for python-magic
RUN apt-get update && apt-get install -y \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend code
COPY server.py /app/server.py
COPY GoogleCloudVisionHandler.py /app/GoogleCloudVisionHandler.py

# Note: Google credentials will be mounted as volume at runtime from GitHub secrets
# Not copied during build for security

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"

# Run the server
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
