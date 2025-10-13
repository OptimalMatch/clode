FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    portaudio19-dev \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Copy lemonpepper library from parent directory
COPY ../../lemonpepper /app/lemonpepper
COPY ../../setup.py /app/setup.py
COPY ../../requirements.txt /app/main_requirements.txt

# Install lemonpepper dependencies
RUN pip install --no-cache-dir -r /app/main_requirements.txt

# Copy backend requirements and install
COPY requirements.txt /app/backend_requirements.txt
RUN pip install --no-cache-dir -r /app/backend_requirements.txt

# Copy backend code
COPY server_enhanced.py /app/server.py

# Create models directory
RUN mkdir -p /app/models

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health')"

# Run the server
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
