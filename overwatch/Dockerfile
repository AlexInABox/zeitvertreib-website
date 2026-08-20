# Build
FROM alpine:3.24 AS build
RUN apk add --no-cache nodejs npm
WORKDIR /app

# Types are consumed as raw TS sources (file: dependency), no build needed
COPY types ../types

COPY overwatch/package*.json ./
RUN npm ci

COPY overwatch/ .
RUN npx tsc

# Run
FROM alpine:3.24

# ffmpeg from Alpine repos so it stays patched (bot processes untrusted media).
RUN apk add --no-cache nodejs ca-certificates ffmpeg

# yt-dlp is a standalone musl binary, avoiding the ~320 MB python3+yt-dlp apk footprint.
ARG YTDLP_VERSION=2026.08.19
RUN apk add --no-cache --virtual .fetch curl \
 && curl -fL -o /usr/local/bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_musllinux" \
 && chmod +x /usr/local/bin/yt-dlp \
 && apk del .fetch

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY overwatch/package*.json ./
RUN apk add --no-cache --virtual .npm npm \
 && npm ci --omit=dev --no-audit --no-fund --cache /tmp/npm-cache \
 && rm -rf /tmp/npm-cache \
 && apk del .npm

# The member tracker stores its synchronization baseline here. Mount this
# directory from Compose so restarts do not make every member look new.
VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]
