# ---- Stage 1: Build ----
FROM node:22-alpine AS builder

# Install dependencies for Puppeteer/Chromium build
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates

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

# Install Chromium for Puppeteer (production)
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates

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

# Ensure temp directory exists for Puppeteer
RUN mkdir -p /tmp && chown nextjs:nodejs /tmp

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

CMD ["node", "server.js"]
