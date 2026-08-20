# Build
FROM alpine:3.24 AS build
RUN apk add --no-cache nodejs npm
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx tsc

# Run
FROM alpine:3.24
RUN apk add --no-cache nodejs ca-certificates
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY package*.json ./
RUN apk add --no-cache --virtual .npm npm \
 && npm ci --omit=dev --no-audit --no-fund --cache /tmp/npm-cache \
 && rm -rf /tmp/npm-cache \
 && apk del .npm

CMD ["node", "dist/index.js"]
