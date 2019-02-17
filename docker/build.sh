#!/bin/run /bin/bash
set -e

apt-get update
apt-get install -y --no-install-recommends curl ca-certificates gnupg
curl -sL https://deb.nodesource.com/setup_10.x | bash -
apt-get install -y nodejs
apt-get clean
rm -rf /var/lib/apt/lists/*
