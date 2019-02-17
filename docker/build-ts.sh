#!/bin/run /bin/bash
set -e

apt-get update
apt-get install -y --no-install-recommends git g++ make
ENV JOBS=max npm ci
npm run build
