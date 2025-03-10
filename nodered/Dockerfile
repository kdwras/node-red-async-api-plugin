FROM nodered/node-red

USER root

# Copy package.json to the WORKDIR so npm builds all
# of your added nodes modules for Node-RED
WORKDIR /data

# Copy custom node to the Node-RED user directory
COPY nodes /data/nodes