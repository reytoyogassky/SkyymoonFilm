# ---- Stage 1: Build ----
FROM node:22-alpine AS builder

# Install dependencies for Puppeteer/Chromium build + curl for IDLIX
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates curl

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Install ALL dependencies (including dev for build)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# ---- Stage 2: Production ----
FROM node:22-alpine AS runner

# Install Chromium for Puppeteer (production) + curl for IDLIX
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates curl

# Set Puppeteer env
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

WORKDIR /app

# Copy built artifacts from standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts

# Ensure temp directory and cache exist for Puppeteer + Next.js
RUN mkdir -p /tmp /app/.next/cache /app/public/idlix-data && chown -R nextjs:nodejs /tmp /app/.next /app/public/idlix-data /app/scripts

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

COPY --from=builder /app/scripts/start-with-cron.sh ./scripts/
RUN chmod +x ./scripts/start-with-cron.sh

CMD ["./scripts/start-with-cron.sh"]
