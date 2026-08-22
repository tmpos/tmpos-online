<?php

return [
    'name' => 'TM Cloud',
    'version' => '1.0.0',
    'env' => 'production',
    'debug' => false,
    'timezone' => 'UTC',

    'api' => [
        'prefix' => '/api',
        'version' => 'v1'
    ],

    'cors' => [
        'allowed_origins' => [
            'http://localhost:3000',
            'http://localhost:5173',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5173'
        ]
    ]
];
