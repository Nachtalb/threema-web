# Running Threema Web with Docker

Images are published to
[`ghcr.io/nachtalb/threema-web`](https://github.com/Nachtalb/threema-web/pkgs/container/threema-web)
by `.github/workflows/docker.yml` on every push to `hate-driven-development`
(`:hate-driven-development`, `:sha-<sha>`) and on `v*` tags (`:2.6.5`, `:2.6`,
`:latest`).

Build it yourself:

    $ docker build . -t threema-web

Run it:

    $ docker run --rm -p 8080:8080 --read-only threema-web

Now open `http://localhost:8080/`.

The image is [static-web-server](https://static-web-server.net/) on `scratch`
plus the release files: no shell, no package manager, no root, and it runs
read-only. There is **no TLS termination** — put it behind a reverse proxy or an
ingress, and enable HSTS/CSP there.

`/health` returns 200 for liveness/readiness probes.

## Configuration

Mount a JS file over `/public/userconfig.overrides.js`; see
`src/userconfig.overrides.js.example` for the variables.

    $ docker run --rm -p 8080:8080 --read-only \
        -v $PWD/userconfig.overrides.js:/public/userconfig.overrides.js:ro \
        threema-web

The env-var patching of the upstream image is gone. It required bash and a
writable web root, which is the opposite of what this image is for. Server
options are still env vars, prefixed `SERVER_` (`SERVER_PORT`, `SERVER_LOG_LEVEL`,
… see `static-web-server --help`).

## Kubernetes

Manifests in [`k8s/`](../k8s/README.md).
