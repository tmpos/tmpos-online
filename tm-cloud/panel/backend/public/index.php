<?php

require_once __DIR__ . '/../vendor/autoload.php';

use TMCloud\Middleware\CorsMiddleware;
use TMCloud\Controllers\ProjectController;
use TMCloud\Utils\Response;

// Enable CORS
CorsMiddleware::handle();

// Get request method and path
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = str_replace('/api', '', $path);

// Simple router
try {
    // Projects routes
    if (preg_match('#^/projects$#', $path)) {
        $controller = new ProjectController();

        if ($method === 'GET') {
            $controller->index();
        } elseif ($method === 'POST') {
            $controller->create();
        } else {
            Response::error('Method not allowed', 405);
        }
    } elseif (preg_match('#^/projects/(\d+)$#', $path, $matches)) {
        $controller = new ProjectController();
        $id = (int) $matches[1];

        if ($method === 'GET') {
            $controller->show($id);
        } elseif ($method === 'PUT') {
            $controller->update($id);
        } elseif ($method === 'DELETE') {
            $controller->delete($id);
        } else {
            Response::error('Method not allowed', 405);
        }
    } elseif (preg_match('#^/projects/(\d+)/restart$#', $path, $matches)) {
        if ($method === 'POST') {
            $controller = new ProjectController();
            $controller->restart((int) $matches[1]);
        } else {
            Response::error('Method not allowed', 405);
        }
    } elseif (preg_match('#^/projects/(\d+)/suspend$#', $path, $matches)) {
        if ($method === 'POST') {
            $controller = new ProjectController();
            $controller->suspend((int) $matches[1]);
        } else {
            Response::error('Method not allowed', 405);
        }
    } elseif (preg_match('#^/projects/(\d+)/activate$#', $path, $matches)) {
        if ($method === 'POST') {
            $controller = new ProjectController();
            $controller->activate((int) $matches[1]);
        } else {
            Response::error('Method not allowed', 405);
        }
    } elseif (preg_match('#^/projects/(\d+)/logs$#', $path, $matches)) {
        if ($method === 'GET') {
            $controller = new ProjectController();
            $controller->logs((int) $matches[1]);
        } else {
            Response::error('Method not allowed', 405);
        }
    } elseif (preg_match('#^/projects/(\d+)/stats$#', $path, $matches)) {
        if ($method === 'GET') {
            $controller = new ProjectController();
            $controller->stats((int) $matches[1]);
        } else {
            Response::error('Method not allowed', 405);
        }
    } elseif ($path === '/health') {
        Response::json([
            'success' => true,
            'message' => 'TM Cloud API is running',
            'timestamp' => date('Y-m-d H:i:s')
        ]);
    } else {
        Response::error('Route not found', 404);
    }
} catch (\Exception $e) {
    Response::error($e->getMessage(), 500);
}
