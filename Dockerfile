# ---- Stage 1: build the React frontend ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# ---- Stage 2: the image that actually runs ----
# The server only uses Node's built-in modules, so nothing needs to be installed here.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY package.json server.js ./
COPY server ./server

# All app data (the library.db database) is saved here.
# Map this to a folder on the host, e.g. /mnt/user/appdata/personal-library on Unraid.
ENV DATA_DIR=/data
ENV PORT=80

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
