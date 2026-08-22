<?php

return [
    'compose_version' => '3.8',

    'networks' => [
        'driver' => 'bridge'
    ],

    'resources' => [
        'default_cpu_limit' => '2',
        'default_memory_limit' => '2g'
    ],

    'ports' => [
        'range_start' => 8000,
        'range_end' => 9000
    ],

    'volumes' => [
        'backup_retention_days' => 30
    ]
];
