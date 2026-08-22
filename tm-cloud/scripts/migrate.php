#!/usr/bin/env php
<?php

require_once __DIR__ . '/../panel/backend/vendor/autoload.php';

use TMCloud\Database\Database;

try {
    echo "Running database migrations...\n\n";
    Database::migrate();
    echo "\n✓ Migrations completed successfully!\n";
} catch (Exception $e) {
    echo "\n✗ Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
