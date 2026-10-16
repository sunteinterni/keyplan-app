FROM node:22-bookworm-slim
# poppler-utils: turns a client PDF plan into an image · python3/make/g++: fallback if a native module has no prebuilt binary
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
# DATA_DIR must be a persistent volume (Railway: attach a volume at /data; Fly: [mounts] in fly.toml)
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 COOKIE_SECURE=1
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
