# Use the official Eclipse Mosquitto image as a base image
FROM eclipse-mosquitto:latest

# Copy the custom Mosquitto configuration file into the container
COPY config/mosquitto.conf /mosquitto/config/mosquitto.conf

# Expose the necessary ports (1883 for MQTT, 9001 for WebSocket)
EXPOSE 1883 9001

# Start Mosquitto broker with the custom configuration file
CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]
