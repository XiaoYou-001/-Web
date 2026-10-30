FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
COPY scripts/check-bundle.mjs ./scripts/check-bundle.mjs
ARG VITE_AMAP_KEY
ENV VITE_AMAP_KEY=$VITE_AMAP_KEY \
    VITE_API_BASE_URL=/api \
    VITE_AMAP_SERVICE_HOST=/_AMapService \
    VITE_AMAP_SDK_PROXY=/_AMapService/sdk
RUN npm run build

FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend /app/dist /srv

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
COPY server ./server
COPY src/services/sse.js ./src/services/sse.js
RUN mkdir -p /data/shares && chown -R node:node /data
USER node
EXPOSE 3001
CMD ["node", "server.js"]

FROM golang:1.26-alpine AS chat-build
WORKDIR /app
COPY go-chat-server/go.mod go-chat-server/go.sum ./
RUN go mod download
COPY go-chat-server/main.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /chat .

FROM alpine:3 AS chat
COPY --from=chat-build /chat /usr/local/bin/chat
USER 65532:65532
EXPOSE 8080
CMD ["chat"]
