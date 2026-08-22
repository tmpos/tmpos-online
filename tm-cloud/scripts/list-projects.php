#!/usr/bin/env php
<?php

require_once __DIR__ . '/../panel/backend/vendor/autoload.php';

use TMCloud\Database\Database;

try {
    $db = Database::getInstance();

    $stmt = $db->query("SELECT * FROM projects ORDER BY created_at DESC");
    $projects = $stmt->fetchAll();

    if (empty($projects)) {
        echo "No projects found.\n";
        exit(0);
    }

    echo "\nTM Cloud Projects\n";
    echo str_repeat("=", 80) . "\n\n";

    foreach ($projects as $project) {
        echo "ID:              {$project['id']}\n";
        echo "Name:            {$project['name']}\n";
        echo "Slug:            {$project['slug']}\n";
        echo "Domain:          {$project['domain']}\n";
        echo "Status:          {$project['status']}\n";
        echo "Studio Port:     {$project['studio_port']}\n";
        echo "Kong Port:       {$project['kong_port']}\n";
        echo "Created:         {$project['created_at']}\n";
        echo "PostgreSQL:      {$project['postgres_version']}\n";
        echo "Client:          {$project['client_name']}\n";
        echo str_repeat("-", 80) . "\n\n";
    }

    echo "Total projects: " . count($projects) . "\n\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
