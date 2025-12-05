# Build
FROM node:24-alpine AS build
WORKDIR /app

# Copy types package first
COPY types ../types

# Copy overwatch package
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
