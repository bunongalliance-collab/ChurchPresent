<?php
// Forwards Bible API requests to YouVersion, adding the App Key on the server side.
header('Access-Control-Allow-Origin: *');
 
$key = 'XRNniADgalC1qfremSDgYP5mfw9mZuQnRgAPYeDDGbpNLrAc';   // replace with your App Key, keep the quotes
 
$path = $_SERVER['PATH_INFO'] ?? '';
if (strpos($path, '/v1/') !== 0) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo '{"error":"not found"}';
    exit;
}
 
$qs = $_SERVER['QUERY_STRING'] ?? '';
$ch = curl_init('https://api.youversion.com' . $path . ($qs !== '' ? '?' . $qs : ''));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['X-YVP-App-Key: ' . $key],
    CURLOPT_TIMEOUT => 20,
]);
$body = curl_exec($ch);
if ($body === false) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo '{"error":"could not reach YouVersion"}';
    curl_close($ch);
    exit;
}
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);
 
http_response_code($code);
header('Content-Type: ' . ($type ?: 'application/json'));
echo $body;
 