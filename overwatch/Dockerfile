# Build
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY . .
RUN npm install
RUN npx tsc

# Run
FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package*.json ./
RUN npm install --production
CMD ["node", "dist/index.js"]
