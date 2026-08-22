<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=60');

$config = require __DIR__ . '/config.php';
$projectUid = trim((string) ($config['project_uid'] ?? ''));
$publicKey = trim((string) ($config['public_key'] ?? ''));
$baseUrl = rtrim((string) ($config['base_url'] ?? ''), '/');

if (
    $baseUrl === ''
    || $projectUid === ''
    || $publicKey === ''
    || strpos($projectUid, 'PON_AQUI_') === 0
    || strpos($publicKey, 'PON_AQUI_') === 0
) {
    http_response_code(503);
    echo json_encode(['error' => 'Configura api/config.php antes de usar el catálogo.']);
    exit;
}

if (!preg_match('/^[A-Za-z0-9_-]+$/', $projectUid)) {
    http_response_code(500);
    echo json_encode(['error' => 'El project UID configurado no es válido.']);
    exit;
}

$url = $baseUrl . '/api/' . rawurlencode($projectUid) . '/accesorios?limit=100';

if (!function_exists('curl_init')) {
    http_response_code(500);
    echo json_encode(['error' => 'La extensión cURL de PHP no está habilitada.']);
    exit;
}

$curl = curl_init($url);

curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_HTTPHEADER => [
        'Accept: application/json',
        'Authorization: Bearer ' . $publicKey,
    ],
]);

$body = curl_exec($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$error = curl_error($curl);
curl_close($curl);

if ($body === false || $error !== '') {
    http_response_code(502);
    echo json_encode(['error' => 'No fue posible conectar con la API de TMPOS.']);
    exit;
}

http_response_code($status >= 100 ? $status : 502);
echo $body;
