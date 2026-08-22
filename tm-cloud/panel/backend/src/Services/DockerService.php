<?php

namespace TMCloud\Services;

class DockerService
{
    private string $projectsDir;

    public function __construct()
    {
        $this->projectsDir = __DIR__ . '/../../../projects';
    }

    public function createProject(string $projectSlug): bool
    {
        $projectPath = $this->projectsDir . '/' . $projectSlug;

        if (!is_dir($projectPath)) {
            throw new \RuntimeException("Project directory not found: $projectSlug");
        }

        $cmd = "cd '$projectPath' && docker-compose up -d 2>&1";
        $output = [];
        $returnCode = 0;

        exec($cmd, $output, $returnCode);

        if ($returnCode !== 0) {
            throw new \RuntimeException("Failed to start Docker containers: " . implode("\n", $output));
        }

        return true;
    }

    public function startProject(string $projectSlug): bool
    {
        $projectPath = $this->projectsDir . '/' . $projectSlug;

        $cmd = "cd '$projectPath' && docker-compose start 2>&1";
        $output = [];
        $returnCode = 0;

        exec($cmd, $output, $returnCode);

        return $returnCode === 0;
    }

    public function stopProject(string $projectSlug): bool
    {
        $projectPath = $this->projectsDir . '/' . $projectSlug;

        $cmd = "cd '$projectPath' && docker-compose stop 2>&1";
        $output = [];
        $returnCode = 0;

        exec($cmd, $output, $returnCode);

        return $returnCode === 0;
    }

    public function restartProject(string $projectSlug): bool
    {
        $projectPath = $this->projectsDir . '/' . $projectSlug;

        $cmd = "cd '$projectPath' && docker-compose restart 2>&1";
        $output = [];
        $returnCode = 0;

        exec($cmd, $output, $returnCode);

        return $returnCode === 0;
    }

    public function deleteProject(string $projectSlug): bool
    {
        $projectPath = $this->projectsDir . '/' . $projectSlug;

        $cmd = "cd '$projectPath' && docker-compose down -v 2>&1";
        $output = [];
        $returnCode = 0;

        exec($cmd, $output, $returnCode);

        return $returnCode === 0;
    }

    public function getContainerStatus(string $projectSlug): array
    {
        $projectPath = $this->projectsDir . '/' . $projectSlug;

        $cmd = "cd '$projectPath' && docker-compose ps --format json 2>&1";
        $output = [];
        exec($cmd, $output);

        $containers = [];
        foreach ($output as $line) {
            $data = json_decode($line, true);
            if ($data) {
                $containers[] = [
                    'name' => $data['Name'] ?? '',
                    'service' => $data['Service'] ?? '',
                    'status' => $data['State'] ?? 'unknown',
                    'health' => $data['Health'] ?? 'none'
                ];
            }
        }

        return $containers;
    }

    public function getContainerLogs(string $projectSlug, string $service, int $lines = 100): string
    {
        $projectPath = $this->projectsDir . '/' . $projectSlug;

        $cmd = "cd '$projectPath' && docker-compose logs --tail=$lines '$service' 2>&1";
        $output = [];
        exec($cmd, $output);

        return implode("\n", $output);
    }

    public function getContainerStats(string $projectSlug): array
    {
        $cmd = "docker stats --no-stream --format '{{.Container}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.BlockIO}}' 2>&1";
        $output = [];
        exec($cmd, $output);

        $stats = [];
        foreach ($output as $line) {
            if (strpos($line, $projectSlug) !== false) {
                $parts = explode('|', $line);
                $stats[] = [
                    'container' => $parts[0] ?? '',
                    'cpu' => $parts[1] ?? '0%',
                    'memory' => $parts[2] ?? '0B / 0B',
                    'network' => $parts[3] ?? '0B / 0B',
                    'block_io' => $parts[4] ?? '0B / 0B'
                ];
            }
        }

        return $stats;
    }

    public function executeCommand(string $projectSlug, string $service, string $command): string
    {
        $projectPath = $this->projectsDir . '/' . $projectSlug;

        $cmd = "cd '$projectPath' && docker-compose exec -T '$service' $command 2>&1";
        $output = [];
        exec($cmd, $output);

        return implode("\n", $output);
    }

    public function isDockerRunning(): bool
    {
        exec('docker info 2>&1', $output, $returnCode);
        return $returnCode === 0;
    }

    public function getDockerVersion(): string
    {
        exec('docker --version 2>&1', $output);
        return $output[0] ?? 'Unknown';
    }

    public function getDockerComposeVersion(): string
    {
        exec('docker-compose --version 2>&1', $output);
        return $output[0] ?? 'Unknown';
    }
}
