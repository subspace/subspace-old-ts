Subspace core library with a simple full node for testing.

Currently the node will bootstrap the chain and solve blocks until the timeout expires.

```
git clone @subspace/subspace
cd subspace
yarn
node fullNode.js
```

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
