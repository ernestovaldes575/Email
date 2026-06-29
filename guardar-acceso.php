<?php
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'METHOD_NOT_ALLOWED']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'INVALID_JSON']);
    exit;
}

$phone = preg_replace('/\D+/', '', (string)($input['phone'] ?? ''));

if (strlen($phone) < 10 || strlen($phone) > 15) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'INVALID_PHONE']);
    exit;
}

$directory = __DIR__ . DIRECTORY_SEPARATOR . 'data';
$file = $directory . DIRECTORY_SEPARATOR . 'accesos.json';

if (!is_dir($directory)) {
    mkdir($directory, 0755, true);
}

$entry = [
    'phone' => $phone,
    'phoneDisplay' => '+' . $phone,
    'authorizedAt' => gmdate('c'),
    'source' => preg_replace('/[^a-z0-9_-]/i', '', (string)($input['source'] ?? 'unknown')),
    'ip' => $_SERVER['REMOTE_ADDR'] ?? '',
    'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? ''
];

$handle = fopen($file, 'c+');

if (!$handle) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'OPEN_FAILED']);
    exit;
}

flock($handle, LOCK_EX);
$contents = stream_get_contents($handle);
$records = json_decode($contents ?: '[]', true);

if (!is_array($records)) {
    $records = [];
}

$records[] = $entry;
ftruncate($handle, 0);
rewind($handle);
fwrite($handle, json_encode($records, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
fflush($handle);
flock($handle, LOCK_UN);
fclose($handle);

echo json_encode(['ok' => true, 'entry' => $entry]);
