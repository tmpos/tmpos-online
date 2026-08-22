<?php

namespace TMCloud\Controllers;

use TMCloud\Models\Project;
use TMCloud\Services\PortManager;
use TMCloud\Services\SupabaseService;
use TMCloud\Services\DockerService;
use TMCloud\Utils\Response;
use TMCloud\Utils\Validator;

class ProjectController
{
    private Project $projectModel;
    private PortManager $portManager;
    private SupabaseService $supabaseService;
    private DockerService $dockerService;

    public function __construct()
    {
        $this->projectModel = new Project();
        $this->portManager = new PortManager();
        $this->supabaseService = new SupabaseService();
        $this->dockerService = new DockerService();
    }

    public function index(): void
    {
        try {
            $filters = [
                'status' => $_GET['status'] ?? null,
                'search' => $_GET['search'] ?? null
            ];

            $projects = $this->projectModel->findAll($filters);

            Response::json([
                'success' => true,
                'data' => $projects
            ]);

        } catch (\Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    public function show(int $id): void
    {
        try {
            $project = $this->projectModel->findById($id);

            if (!$project) {
                Response::error('Project not found', 404);
                return;
            }

            // Get container status
            $containerStatus = $this->dockerService->getContainerStatus($project['slug']);

            Response::json([
                'success' => true,
                'data' => array_merge($project, [
                    'containers' => $containerStatus
                ])
            ]);

        } catch (\Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    public function create(): void
    {
        try {
            $data = json_decode(file_get_contents('php://input'), true);

            // Validate input
            $errors = Validator::validate($data, [
                'name' => 'required|min:3',
                'slug' => 'required|alpha_dash|min:3',
                'domain' => 'required|domain'
            ]);

            if (!empty($errors)) {
                Response::error('Validation failed', 422, ['errors' => $errors]);
                return;
            }

            // Check if slug or domain already exists
            if ($this->projectModel->exists('slug', $data['slug'])) {
                Response::error('Slug already exists', 422);
                return;
            }

            if (!empty($data['domain']) && $this->projectModel->exists('domain', $data['domain'])) {
                Response::error('Domain already exists', 422);
                return;
            }

            // Generate credentials
            $jwtSecret = $this->supabaseService->generateJWTSecret();
            $postgresPassword = $this->supabaseService->generatePostgresPassword();
            $apiKeys = $this->supabaseService->generateAPIKeys($jwtSecret);

            // Allocate ports (create placeholder project first)
            $projectData = [
                'name' => $data['name'],
                'slug' => $data['slug'],
                'domain' => $data['domain'],
                'postgres_password' => $postgresPassword,
                'jwt_secret' => $jwtSecret,
                'anon_key' => $apiKeys['anon_key'],
                'service_role_key' => $apiKeys['service_role_key'],
                'studio_port' => 0,
                'kong_port' => 0,
                'auth_port' => 0,
                'realtime_port' => 0,
                'postgres_version' => $data['postgres_version'] ?? '15',
                'max_connections' => $data['max_connections'] ?? 100,
                'max_storage_gb' => $data['max_storage_gb'] ?? 10,
                'cpu_limit' => $data['cpu_limit'] ?? '2',
                'memory_limit' => $data['memory_limit'] ?? '2g',
                'client_name' => $data['client_name'] ?? null,
                'client_email' => $data['client_email'] ?? null,
                'client_company' => $data['client_company'] ?? null
            ];

            $projectId = $this->projectModel->create($projectData);

            // Allocate ports
            $ports = $this->portManager->allocatePorts($projectId);

            // Update project with ports
            $this->projectModel->update($projectId, [
                'studio_port' => $ports['studio'],
                'kong_port' => $ports['kong'],
                'auth_port' => $ports['auth'],
                'realtime_port' => $ports['realtime']
            ]);

            // Create project structure
            $this->supabaseService->createProjectStructure($data['slug']);

            // Generate configuration files
            $config = [
                'slug' => $data['slug'],
                'domain' => $data['domain'],
                'ports' => $ports,
                'postgres_password' => $postgresPassword,
                'jwt_secret' => $jwtSecret,
                'anon_key' => $apiKeys['anon_key'],
                'service_role_key' => $apiKeys['service_role_key']
            ];

            $dockerCompose = $this->supabaseService->generateDockerCompose($config);
            $envFile = $this->supabaseService->generateEnvFile($config);

            $metadata = [
                'project_id' => $projectId,
                'created_at' => date('Y-m-d H:i:s'),
                'version' => '1.0.0'
            ];

            $this->supabaseService->saveProjectFiles($data['slug'], $dockerCompose, $envFile, $metadata);

            // Start Docker containers
            $this->dockerService->createProject($data['slug']);

            // Get final project data
            $project = $this->projectModel->findById($projectId);

            Response::json([
                'success' => true,
                'message' => 'Project created successfully',
                'data' => [
                    'project' => $project,
                    'url' => "https://{$data['domain']}",
                    'studio_url' => "https://{$data['domain']}/studio",
                    'credentials' => [
                        'anon_key' => $apiKeys['anon_key'],
                        'service_role_key' => $apiKeys['service_role_key']
                    ]
                ]
            ], 201);

        } catch (\Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    public function update(int $id): void
    {
        try {
            $project = $this->projectModel->findById($id);

            if (!$project) {
                Response::error('Project not found', 404);
                return;
            }

            $data = json_decode(file_get_contents('php://input'), true);

            $this->projectModel->update($id, $data);

            $updatedProject = $this->projectModel->findById($id);

            Response::json([
                'success' => true,
                'message' => 'Project updated successfully',
                'data' => $updatedProject
            ]);

        } catch (\Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    public function delete(int $id): void
    {
        try {
            $project = $this->projectModel->findById($id);

            if (!$project) {
                Response::error('Project not found', 404);
                return;
            }

            // Stop and remove containers
            $this->dockerService->deleteProject($project['slug']);

            // Delete project files
            $this->supabaseService->deleteProjectFiles($project['slug']);

            // Release ports
            $this->portManager->releasePorts($id);

            // Delete from database
            $this->projectModel->delete($id);

            Response::json([
                'success' => true,
                'message' => 'Project deleted successfully'
            ]);

        } catch (\Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    public function restart(int $id): void
    {
        try {
            $project = $this->projectModel->findById($id);

            if (!$project) {
                Response::error('Project not found', 404);
                return;
            }

            $this->dockerService->restartProject($project['slug']);

            Response::json([
                'success' => true,
                'message' => 'Project restarted successfully'
            ]);

        } catch (\Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    public function suspend(int $id): void
    {
        try {
            $project = $this->projectModel->findById($id);

            if (!$project) {
                Response::error('Project not found', 404);
                return;
            }

            $this->dockerService->stopProject($project['slug']);
            $this->projectModel->updateStatus($id, 'suspended');

            Response::json([
                'success' => true,
                'message' => 'Project suspended successfully'
            ]);

        } catch (\Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    public function activate(int $id): void
    {
        try {
            $project = $this->projectModel->findById($id);

            if (!$project) {
                Response::error('Project not found', 404);
                return;
            }

            $this->dockerService->startProject($project['slug']);
            $this->projectModel->updateStatus($id, 'active');

            Response::json([
                'success' => true,
                'message' => 'Project activated successfully'
            ]);

        } catch (\Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    public function logs(int $id): void
    {
        try {
            $project = $this->projectModel->findById($id);

            if (!$project) {
                Response::error('Project not found', 404);
                return;
            }

            $service = $_GET['service'] ?? 'db';
            $lines = (int) ($_GET['lines'] ?? 100);

            $logs = $this->dockerService->getContainerLogs($project['slug'], $service, $lines);

            Response::json([
                'success' => true,
                'data' => [
                    'service' => $service,
                    'logs' => $logs
                ]
            ]);

        } catch (\Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    public function stats(int $id): void
    {
        try {
            $project = $this->projectModel->findById($id);

            if (!$project) {
                Response::error('Project not found', 404);
                return;
            }

            $stats = $this->dockerService->getContainerStats($project['slug']);

            Response::json([
                'success' => true,
                'data' => $stats
            ]);

        } catch (\Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }
}
