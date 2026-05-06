# Build
FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY . .
RUN npm install
RUN npx tsc
RUN npm prune --omit=dev

# Run
FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
COPY schema.sql ./
CMD ["node", "dist/index.js"]