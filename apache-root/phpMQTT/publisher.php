<?php

$server = "mqtt-broker";
$port = 1883;
$topic = "test/topic";

$client = new Mosquitto\Client();
$client->connect($server, $port, 60);

$message = "Hello from PHP MQTT with Apache!";
$client->publish($topic, $message, 0, false);

echo "Message published: $message";

