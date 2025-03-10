<?php

$file = "streetlights-asyncAPI.json";  // Path to your AsyncAPI file
$output = "nodered_flow.json"; // Output file for Node-RED

if (!file_exists($file)) {
    die("Error: AsyncAPI JSON file not found.");
}

$data = json_decode(file_get_contents($file), true);

if (json_last_error() !== JSON_ERROR_NONE) {
    die("Error: Invalid JSON format.");
}

// Extract MQTT details
//$server = gethostbyname($asyncapiData['servers']['localhost']['host']) ?? "localhost";
//$port = $asyncapiData['servers']['localhost']['variables']['port']['default'] ?? "1883";
//
//// Extract channels (topics)
//$channels = $asyncapiData['channels'] ?? [];
//$nodeRedNodes = [];

if (!isset($data['servers'])) {
    throw new Exception("Servers not set.");
}

if (!isset($data['channels'])) {
    throw new Exception("Channels not set.");
}

if (!isset($data['operations'])) {
    throw new Exception("Operations not set.");
}

$nodeType = 'AsyncAPI3xRed';

$noderedServers = [];
foreach ($data['servers'] as $server) {
    $noderedServers[] = [
        'id' => uniqid(),
        "type"=> $nodeType,
        'name' => $server['description'],
        'url' => $server['protocol'] . '://' . $server['host'],
        'urlType' => 'str',
        "serverType" => "custom",
        "devMode" => false,
        "headers" => []
    ];
}

//nodered implementation

//

$asyncApiNode = [
    "id" => uniqid(),
    "type" => "tab",
    "label" => $nodeType,
    "disabled" => false,
    "info" => "this a plugin to draw AsyncAPI v3.x descriptions"
];

$nodeRedNodes = [
    $asyncApiNode,
    $noderedServers[0]
];

$nodeRedJson = json_encode($nodeRedNodes, JSON_PRETTY_PRINT);
file_put_contents($output, $nodeRedJson);
?>