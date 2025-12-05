# Build
FROM node:24-alpine AS build
WORKDIR /app

# Copy and build types package first
COPY types ../types
WORKDIR /types
RUN npm install && npm run build

# Copy overwatch package
WORKDIR /app
COPY overwatch/package*.json ./
COPY overwatch/ .

RUN npm install
RUN npx tsc

# Run
FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY overwatch/package*.json ./

# Copy types for runtime (needed for file: dependency resolution)
COPY --from=build /types ../types

RUN npm install --production
CMD ["node", "dist/index.js"]
