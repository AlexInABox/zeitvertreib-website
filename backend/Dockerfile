# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install --only=development

# Copy source code and compile TypeScript
COPY . .
RUN npx tsc

# Stage 2: Production Image
FROM node:18-alpine

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm install --only=production

# Copy compiled JavaScript files
COPY --from=builder /app/dist /app/dist

EXPOSE 3000 3001

CMD ["node", "dist/index.js"]