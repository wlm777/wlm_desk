FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
RUN echo "=== .bin ===" && ls -la node_modules/.bin/next || true
RUN echo "=== next pkg ===" && ls -la node_modules/next || true
RUN echo "=== next bin ===" && ls -la node_modules/next/dist/bin || true
RUN npm ls next
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
