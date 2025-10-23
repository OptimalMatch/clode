FROM ubuntu:22.04

# Set non-interactive mode
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js 18 from NodeSource (Ubuntu's default Node.js is too old)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app

# Copy package files and install dependencies (this can be cached)
# Force cache bust for new dependencies: 2025-10-23
COPY package*.json ./
RUN npm install

# Accept build arguments for environment variables
ARG REACT_APP_API_URL
ARG REACT_APP_WS_URL
ARG REACT_APP_API_PORT
ARG REACT_APP_WS_PORT
ARG REACT_APP_VOICE_API_URL

# Set environment variables for build
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_WS_URL=$REACT_APP_WS_URL
ENV REACT_APP_API_PORT=$REACT_APP_API_PORT
ENV REACT_APP_WS_PORT=$REACT_APP_WS_PORT
ENV REACT_APP_VOICE_API_URL=$REACT_APP_VOICE_API_URL

# Copy source code (NEVER cache this - always get fresh source)
COPY . .

# Build for production (NEVER cache this - always rebuild with fresh source)
RUN npm run build

# Install serve to serve the production build
RUN npm install -g serve

EXPOSE 3000

# Serve the production build instead of running dev server
CMD ["serve", "-s", "build", "-l", "3000"]