<?php
$server = "mqtt-broker";
$port = 1883;
$topic = "test/topic";

$client = new Mosquitto\Client();
$client->connect($server, $port, 60);

$client->onMessage(function ($message) {
    echo "Received: {$message->payload}\n";
});

$client->subscribe($topic, 0);

while (true) {
    $client->loop();
}
?>
