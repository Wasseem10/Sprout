FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
# Explicit source allowlist: a cloud settings file can never enter an image layer.
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY src ./src
COPY shared ./shared
COPY server ./server
COPY public ./public
COPY data ./data
COPY migrations ./migrations
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4311 LOCAL_DATA_DIR=/app/.local
WORKDIR /app
COPY package.json package-lock.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci --omit=dev --ignore-scripts \
    && mkdir -p /app/.local \
    && chown -R node:node /app \
    && chmod 700 /app/.local
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server
COPY --from=build --chown=node:node /app/data ./data
COPY --from=build --chown=node:node /app/migrations ./migrations
# Fail the image build if production imports/native canvas are unavailable on Linux.
RUN node --input-type=module -e "await import('./dist-server/server/app.js'); const {createCanvas}=await import('@napi-rs/canvas'); createCanvas(2,2).toBuffer('image/png')"
USER node
EXPOSE 4311
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:4311/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","dist-server/server/start.js"]
