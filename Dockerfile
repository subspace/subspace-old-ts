# Common image for build step and final image
FROM subspacelabs/ubuntu as ubuntu-with-node

WORKDIR /code

COPY docker/build.sh /build.sh

RUN ["/build.sh"]

# Install dependencies, build TypeScript
FROM ubuntu-with-node as build

COPY src /code/src
COPY types /code/types
COPY package.json /code
COPY package-lock.json /code
COPY tsconfig.json /code

RUN ["/bin/run", "apt-get update"]
RUN ["/bin/run", "apt-get install -y --no-install-recommends git g++ make"]
ENV JOBS=max
RUN ["/bin/run", "npm ci"]
RUN ["/bin/run", "npm run build"]

# Build final image without build-time dependencies
FROM ubuntu-with-node

COPY docker/entrypoint.sh /entrypoint.sh

COPY bin /code/bin
COPY --from=build /code/dist /code/dist
COPY --from=build /code/node_modules /code/node_modules
COPY package.json /code
COPY package-lock.json /code

ENTRYPOINT ["/entrypoint.sh"]
