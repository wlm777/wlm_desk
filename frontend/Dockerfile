FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
RUN ls -la node_modules/.bin/next || echo "NO NEXT BINARY"
RUN npm ls next || echo "NEXT NOT IN TREE"
RUN find node_modules -maxdepth 3 -name "next" -type d | head -20
RUN cat node_modules/.package-lock.json | grep -A5 '"next"' | head -20 || true
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
