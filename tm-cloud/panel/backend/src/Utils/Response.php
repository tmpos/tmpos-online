<?php

namespace TMCloud\Utils;

class Response
{
    public static function json(array $data, int $statusCode = 200): void
    {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        echo json_encode($data, JSON_PRETTY_PRINT);
        exit;
    }

    public static function error(string $message, int $statusCode = 400, array $additional = []): void
    {
        self::json(array_merge([
            'success' => false,
            'error' => $message
        ], $additional), $statusCode);
    }

    public static function success(string $message, array $data = []): void
    {
        self::json([
            'success' => true,
            'message' => $message,
            'data' => $data
        ]);
    }
}
