#!/bin/run /bin/bash
set -e

JOBS=max npm ci
npm run build
npm prune --production
