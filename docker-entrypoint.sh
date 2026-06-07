#!/bin/sh
set -e

mkdir -p /data
chown -R node:node /data

exec su-exec node "$@"
