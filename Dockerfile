FROM arm32v7/node:10

WORKDIR /code

COPY src /code/src
COPY types /code/types
COPY package.json /code
COPY package-lock.json /code
COPY tsconfig.json /code

RUN JOBS=max npm ci
RUN npm run build

COPY genesisNode.js /code

ENTRYPOINT ["/usr/local/bin/node"]
CMD ["genesisNode.js"]
