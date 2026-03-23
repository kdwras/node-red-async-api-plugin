# Node-RED AsyncAPI Plugin

---

## Overview

This project provides a **Docker-based development environment** that integrates:

* **Node-RED** for flow-based programming
* **MQTT Broker (Mosquitto)** for message communication
* A **custom AsyncAPI Node-RED node**

The custom node reads an **AsyncAPI specification** and dynamically configures message-based communication in Node-RED, enabling **schema-driven development** and reducing manual configuration.

---

## Features

* Automated setup using Docker & Docker Compose
* Preconfigured Node-RED environment
* Integrated MQTT broker (Mosquitto)
* Custom AsyncAPI Node
* Dynamic extraction of:

  * servers
  * channels
  * operations
  * payload schemas
* Schema-based message validation
* Rapid prototyping of event-driven architectures

---

## Prerequisites

Before running the project, make sure you have installed:

* Docker
* Docker Compose

---

## Project Structure

```
project/
│
├── docker-compose.yml
├── build.sh
├── start.sh
├── stop.sh
├── restart.sh
├── build-editor.sh
├── README.md
│
├── nodered/
│   ├── data/
│   └── nodes/
│       └── async-api-node/
│
├── mqtt/
│   ├── config/
│   ├── data/
│   └── log/
```

---

## Getting Started

### 1. Build Docker Images

Run this once before starting the project:

```bash
./build.sh
```

---

### 2. Start the Project

```bash
./start.sh
```

This will:

* Start Node-RED
* Start the MQTT broker
* Run containers in the background

---

### 3. Access Node-RED

Open your browser:

```
http://localhost:1880
```

---

### 4. Stop the Project

```bash
./stop.sh
```

---

### 5. Restart the Project

```bash
./restart.sh
```

---

## Editor Build (AsyncAPI Node)

If you modify the **editor/UI part** of the custom node, you must rebuild it inside the container.

### Run:

```bash
./build-editor.sh
```

---

### What this script does

* Enters the **Node-RED container**
* Navigates to:

  ```
  /data/nodes/async-api-node
  ```
* Installs dependencies (`npm install`)
* Builds the editor:

  ```bash
  npm run build:editor
  ```

---

### When to use it

Run this script when you change:

* `async-api-red.html`
* Editor UI logic
* Frontend behavior of the node

---

### Important Notes

* The container must be running before executing the script
* If changes are not visible:

  1. Run `./build-editor.sh`
  2. Restart containers:

     ```bash
     ./restart.sh
     ```
  3. Refresh the browser (hard reload)

---

## Usage

1. Open Node-RED in your browser
2. Drag the custom AsyncAPI node into the flow
3. Upload an AsyncAPI specification file
4. Select:

  * server
  * channel
  * operation
5. Configure payload and parameters
6. Deploy the flow

---

## How It Works

1. User uploads an AsyncAPI document
2. The node parses the specification
3. Extracts:

  * channels
  * operations
  * schemas
4. The editor UI is dynamically populated
5. At runtime:

  * Node connects to MQTT broker
  * Publishes or subscribes to topics
  * Validates messages based on schema

---

## Services & Ports

| Service   | Port | Description         |
| --------- | ---- | ------------------- |
| Node-RED  | 1880 | Web UI              |
| MQTT      | 1883 | MQTT communication  |
| WebSocket | 9001 | MQTT over WebSocket |

---

## Troubleshooting

### Node-RED not accessible

Check running containers:

```bash
docker compose ps
```

---

### MQTT not working

Check broker logs:

```bash
docker logs mosquitto
```

---

### Changes not applied

Rebuild containers:

```bash
./build.sh
```

---

## Notes

* Requires a valid AsyncAPI specification
* Currently supports MQTT-based communication
* Docker environment is mandatory

---

## Future Improvements

* Support for additional protocols (Kafka, AMQP)
* Improved UI/UX for schema visualization

---

## License

This project is intended for educational and development purposes.

---
