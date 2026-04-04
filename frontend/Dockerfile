FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci && \
    echo "=== DEBUG: .bin contents ===" && \
    ls -la node_modules/.bin/next 2>&1 || true && \
    echo "=== DEBUG: next package ===" && \
    ls -la node_modules/next/dist/bin/ 2>&1 || true && \
    echo "=== DEBUG: npm ls ===" && \
    npm ls next 2>&1 || true && \
    echo "=== DEBUG: which next ===" && \
    which next 2>&1 || true && \
    echo "=== DEBUG: PATH ===" && \
    echo $PATH && \
    echo "=== DEBUG: node_modules/.bin listing ===" && \
    ls node_modules/.bin/ | head -20 || true
COPY . .
RUN node node_modules/next/dist/bin/next build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
