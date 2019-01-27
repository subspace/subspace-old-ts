FROM node:10

WORKDIR /code

COPY bin /code/bin
COPY src /code/src
COPY types /code/types
COPY package.json /code
COPY package-lock.json /code
COPY tsconfig.json /code

RUN JOBS=max npm ci
RUN npm run build

ENTRYPOINT ["/usr/local/bin/node"]
CMD ["bin/subspace.js"]
