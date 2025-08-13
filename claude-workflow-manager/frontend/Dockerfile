FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Accept build arguments for environment variables
ARG REACT_APP_API_URL
ARG REACT_APP_WS_URL
ARG REACT_APP_API_PORT

# Set environment variables for build
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_WS_URL=$REACT_APP_WS_URL
ENV REACT_APP_API_PORT=$REACT_APP_API_PORT

# Build for production with environment variables
RUN npm run build

# Install serve to serve the production build
RUN npm install -g serve

EXPOSE 3000

# Serve the production build instead of running dev server
CMD ["serve", "-s", "build", "-l", "3000"]