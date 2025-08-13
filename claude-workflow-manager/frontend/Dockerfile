FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build for production
RUN npm run build

# Install serve to serve the production build
RUN npm install -g serve

EXPOSE 3000

# Serve the production build instead of running dev server
CMD ["serve", "-s", "build", "-l", "3000"]