# ---- Stage 1: build the React frontend ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# ---- Stage 2: the image that actually runs ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps
COPY --from=builder /app/dist ./dist
COPY server.js ./

# All app data (users.json, library.json) is saved here.
# Map this to a folder on the host, e.g. /mnt/user/appdata/personal-library on Unraid.
ENV DATA_DIR=/data
ENV PORT=80

EXPOSE 80
CMD ["node", "server.js"]
