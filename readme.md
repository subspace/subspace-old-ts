Subspace core library with a simple full node and browser client for testing.

### Build core protocol and browser client
```
git clone @subspace/subspace
cd subspace
npm install
npm run build
node startup.js 1 10000 bootstrap
```
This will bootstrap a new ledger with one genesis farmer and subsequently add a second farmer, both connected over local host.

You can then open index.html in any browser and client node will connect to the geneis farmer, allowing you visually inspect messages/blocks and monitor network status.

### Building Docker image
In order to get source code and build an image run:
```bash
git clone git@github.com:subspace/subspace.git
cd subspace
docker build -t subspacelabs/subspace .
```

If you want to push new image to Subspace's Docker Hub organization afterwards:
```bash
docker push subspacelabs/subspace
```

### Building Docker image for 32-bit ARMv7
In order to get source code and build an image run:
```bash
git clone git@github.com:subspace/subspace.git
cd subspace
docker build -t subspacelabs/subspace:arm32v7 -f Dockerfile-arm32v7 .
```

If you want to push new image to Subspace's Docker Hub organization afterwards:
```bash
docker push subspacelabs/subspace:arm32v7
```

### Building Docker image for 64-bit ARMv8
In order to get source code and build an image run:
```bash
git clone git@github.com:subspace/subspace.git
cd subspace
docker build -t subspacelabs/subspace:arm64v8 -f Dockerfile-arm64v8 .
```

If you want to push new image to Subspace's Docker Hub organization afterwards:
```bash
docker push subspacelabs/subspace:arm64v8
```
