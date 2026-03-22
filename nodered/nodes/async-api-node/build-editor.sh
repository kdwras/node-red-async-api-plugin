#!/bin/bash

# =========================================================
# Script: Build AsyncAPI Editor inside Docker container
# =========================================================

CONTAINER_NAME=nodered
NODE_PATH=/data/nodes/async-api-node

echo "➡️ Entering container: $CONTAINER_NAME"

docker exec -it $CONTAINER_NAME sh -c "

    echo '📁 Moving to project folder...'
    cd $NODE_PATH || exit 1

    echo '📦 Installing / updating dependencies...'
    npm install

    echo '🔨 Building editor...'
    npm run build:editor

    echo '✅ Build completed!'
"