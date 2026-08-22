# Threema Web as a static site, served from a scratch image.
#
# No TLS, no shell, no package manager: run it behind a reverse proxy or an
# ingress. Runtime config is a userconfig.overrides.js mounted over
# /public/userconfig.overrides.js (see k8s/configmap.yaml).

FROM docker.io/oven/bun:1 AS builder
ENV NODE_ENV=production
WORKDIR /src

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN sed -i "s/SELF_HOSTED: [^,]*,/SELF_HOSTED: true,/g" src/config.ts \
 && bun run dist \
 && mv release/threema-web-* /site \
 && find /site -name '*.map' -delete \
 && : > /site/userconfig.overrides.js \
 && chmod -R a+rX /site

FROM ghcr.io/static-web-server/static-web-server:2
COPY --from=builder /site /public
USER 65534:65534
EXPOSE 8080
ENV SERVER_PORT=8080 \
    SERVER_ROOT=/public \
    SERVER_HEALTH=true \
    SERVER_COMPRESSION=true \
    SERVER_CACHE_CONTROL_HEADERS=true \
    SERVER_SECURITY_HEADERS=true \
    SERVER_LOG_LEVEL=info
