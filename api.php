<?php
/**
 * DeepL API Usage Proxy
 * 
 * Acts as a middleware to forward requests to DeepL API to avoid CORS issues
 * and handle authentication securely.
 */

session_start();

// ENABLE DEBUGGING
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Debug Log Function
function debug_log($message, $data = null) {
    $logFile = __DIR__ . '/debug.log';
    $timestamp = date('Y-m-d H:i:s');
    $logEntry = "[$timestamp] $message";
    if ($data !== null) {
        $logEntry .= ": " . print_r($data, true);
    }
    file_put_contents($logFile, $logEntry . PHP_EOL, FILE_APPEND);
}

header('Content-Type: application/json; charset=utf-8');

// CSRF & Session Init Handler
if (isset($_GET['action']) && $_GET['action'] === 'init') {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    echo json_encode(['token' => $_SESSION['csrf_token']]);
    exit;
}

// Security Check: Validate CSRF Token
$headers = getallheaders();
$headers = array_change_key_case($headers, CASE_LOWER);
$clientToken = $headers['x-csrf-token'] ?? '';
$sessionToken = $_SESSION['csrf_token'] ?? '';

if (empty($sessionToken) || !hash_equals($sessionToken, $clientToken)) {
    http_response_code(403);
    echo json_encode([
        'message' => 'Security Check Failed (CSRF)',
        'detail' => 'Invalid or missing CSRF token. Please refresh the page.'
    ]);
    exit;
}

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Get API Key from custom header or query parameter
$apiKey = '';

if (isset($headers['x-deepl-auth-key'])) {
    $apiKey = $headers['x-deepl-auth-key'];
} elseif (isset($_GET['key'])) {
    $apiKey = $_GET['key'];
}


// Log incoming request
debug_log("Incoming Request", [
    'method' => $_SERVER['REQUEST_METHOD'],
    'headers_received' => array_keys($headers),
    'has_api_key' => !empty($apiKey) ? 'Yes (Masked: ' . substr($apiKey, 0, 5) . '...)' : 'No'
]);

if (empty($apiKey)) {
    debug_log("Error: Missing API Key");
    http_response_code(400);
    echo json_encode([
        'message' => '缺少 API 密钥 (Missing API Key)',
        'detail' => 'Please provide X-DeepL-Auth-Key header or key parameter'
    ]);
    exit;
}

// DeepL Free API Endpoint
$url = 'https://api-free.deepl.com/v2/usage';

debug_log("Forwarding to DeepL", ['url' => $url]);

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: DeepL-Auth-Key " . trim($apiKey)
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 5); // Set timeout to ensure responsive UX
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

// Get verbose debug info from cURL
curl_setopt($ch, CURLOPT_VERBOSE, true);
$verbose = fopen('php://temp', 'w+');
curl_setopt($ch, CURLOPT_STDERR, $verbose);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);

// Read verbose log
rewind($verbose);
$verboseLog = stream_get_contents($verbose);
fclose($verbose);

debug_log("DeepL Response", [
    'http_code' => $httpCode,
    'error' => $curlError,
    'response_length' => strlen($response),
    'curl_verbose' => $verboseLog
]);

curl_close($ch);

if ($curlError) {
    debug_log("cURL Error Encountered");
    http_response_code(502);
    echo json_encode([
        'message' => 'API 请求失败 (Request Failed)',
        'detail' => $curlError,
        'debug_info' => $verboseLog // Expose to frontend in debug mode
    ]);
    exit;
}

// Forward the status code from DeepL
http_response_code($httpCode);

// Return the response
echo $response ? $response : json_encode(['message' => 'Empty response from DeepL']);
