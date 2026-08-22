<?php

namespace TMCloud\Utils;

class Logger
{
    private static string $logDir = __DIR__ . '/../../storage/logs';

    public static function info(string $message, array $context = []): void
    {
        self::log('INFO', $message, $context);
    }

    public static function error(string $message, array $context = []): void
    {
        self::log('ERROR', $message, $context);
    }

    public static function warning(string $message, array $context = []): void
    {
        self::log('WARNING', $message, $context);
    }

    public static function debug(string $message, array $context = []): void
    {
        self::log('DEBUG', $message, $context);
    }

    private static function log(string $level, string $message, array $context): void
    {
        if (!is_dir(self::$logDir)) {
            mkdir(self::$logDir, 0755, true);
        }

        $logFile = self::$logDir . '/' . date('Y-m-d') . '.log';

        $timestamp = date('Y-m-d H:i:s');
        $contextJson = !empty($context) ? ' ' . json_encode($context) : '';

        $logLine = "[$timestamp] [$level] $message$contextJson" . PHP_EOL;

        file_put_contents($logFile, $logLine, FILE_APPEND);
    }
}
