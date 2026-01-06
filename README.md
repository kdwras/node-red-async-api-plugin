# node-red-async-api-plugin

This project provides an **automated, Docker-based development environment**
that sets up **Node-RED** together with an **MQTT broker** out of the box.

In addition, it includes a **custom Node-RED node** that reads an
**AsyncAPI specification file** and automatically generates a corresponding
**Node-RED node/plugin** based on that specification.

The main goal of this project is to bridge **AsyncAPI** and **Node-RED** by
enabling schema-driven, message-based integrations without manual Node-RED
node development.

---

## Key Features

- Automated setup of **Node-RED** and **MQTT** using Docker and Docker Compose
- Zero manual installation of Node-RED or broker dependencies
- Custom Node-RED node that:
    - Parses an AsyncAPI specification
    - Extracts messaging definitions (channels, operations, schemas)
    - Generates Node-RED nodes/plugins dynamically
- Enables rapid prototyping of message-driven architectures
- Improves consistency between AsyncAPI contracts and Node-RED implementations

---

## Project Purpose

Traditionally, creating Node-RED nodes for message-based systems requires
manual configuration and custom development.

This project aims to:
- Reduce manual effort by generating Node-RED nodes directly from AsyncAPI
- Ensure alignment between AsyncAPI contracts and Node-RED flows
- Provide a reproducible local environment for development and testing
- Serve as a foundation for further AsyncAPI-driven tooling in Node-RED


## Prerequisites

- Docker
- Docker Compose

---

## Build Docker images

Before running the project for the first time, build the Docker images:

```bash
./build.sh
```
Start the containers

To start the project:

```bash
./start.sh
```
Stop the containers

To stop the running containers:

```bash
./stop.sh
```
Restart the containers

To restart the containers:

```bash
./restart.sh
```
