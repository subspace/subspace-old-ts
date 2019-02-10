# Build TypeScript with node:10 image
FROM node:10

WORKDIR /code

COPY src /code/src
COPY types /code/types
COPY package.json /code
COPY package-lock.json /code
COPY tsconfig.json /code

RUN \
    JOBS=max npm ci && \
    npm run build

# Build final image on top of ubuntu:18.04 image that is a shared base with other images without build-time dependencies
FROM ubuntu:18.04

WORKDIR /code

RUN \
    apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates gnupg && \
    curl -sL https://deb.nodesource.com/setup_10.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY bin /code/bin
COPY --from=0 /code/dist /code/dist
COPY docker /code/docker
COPY --from=0 /code/node_modules /code/node_modules
COPY package.json /code
COPY package-lock.json /code

ENTRYPOINT ["/code/docker/entrypoint.sh"]
