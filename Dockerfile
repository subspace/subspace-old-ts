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
FROM subspacelabs/ubuntu

WORKDIR /code

COPY docker/build.sh /build.sh
COPY docker/entrypoint.sh /entrypoint.sh

RUN ["/build.sh"]

COPY bin /code/bin
COPY --from=0 /code/dist /code/dist
COPY --from=0 /code/node_modules /code/node_modules
COPY package.json /code
COPY package-lock.json /code

ENTRYPOINT ["/entrypoint.sh"]
