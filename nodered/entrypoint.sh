#!/bin/bash
set -e

echo "👉 Starting Node-RED with custom entrypoint..."

# Switch to the Node-RED app directory where package.json with "start" exists
cd /usr/src/node-red

# Start Node-RED and tell it to use /data for user files
exec npm start -- --userDir /data
