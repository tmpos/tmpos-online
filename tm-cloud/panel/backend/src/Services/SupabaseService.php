<?php

namespace TMCloud\Services;

use Firebase\JWT\JWT;

class SupabaseService
{
    private string $projectsDir;
    private string $templatesDir;

    public function __construct()
    {
        $this->projectsDir = __DIR__ . '/../../../projects';
        $this->templatesDir = __DIR__ . '/../../templates/supabase-base';
    }

    public function generateJWTSecret(): string
    {
        return base64_encode(random_bytes(32));
    }

    public function generatePostgresPassword(): string
    {
        return bin2hex(random_bytes(16));
    }

    public function generateAPIKeys(string $jwtSecret): array
    {
        $payload = [
            'iat' => time(),
            'exp' => time() + (365 * 24 * 60 * 60) // 1 year
        ];

        $anonPayload = array_merge($payload, ['role' => 'anon']);
        $servicePayload = array_merge($payload, ['role' => 'service_role']);

        return [
            'anon_key' => JWT::encode($anonPayload, $jwtSecret, 'HS256'),
            'service_role_key' => JWT::encode($servicePayload, $jwtSecret, 'HS256')
        ];
    }

    public function createProjectStructure(string $slug): bool
    {
        $projectPath = $this->projectsDir . '/' . $slug;

        if (is_dir($projectPath)) {
            throw new \RuntimeException("Project directory already exists: $slug");
        }

        // Create directories
        $dirs = [
            $projectPath,
            "$projectPath/volumes",
            "$projectPath/volumes/db",
            "$projectPath/volumes/storage",
            "$projectPath/volumes/logs",
            "$projectPath/volumes/kong"
        ];

        foreach ($dirs as $dir) {
            if (!mkdir($dir, 0755, true)) {
                throw new \RuntimeException("Failed to create directory: $dir");
            }
        }

        return true;
    }

    public function generateDockerCompose(array $config): string
    {
        $template = file_get_contents($this->templatesDir . '/docker-compose.yml');

        $replacements = [
            '{{PROJECT_SLUG}}' => $config['slug'],
            '{{DOMAIN}}' => $config['domain'],
            '{{POSTGRES_PORT}}' => $config['ports']['postgres'] ?? 5432,
            '{{STUDIO_PORT}}' => $config['ports']['studio'],
            '{{KONG_PORT}}' => $config['ports']['kong'],
            '{{AUTH_PORT}}' => $config['ports']['auth'],
            '{{REALTIME_PORT}}' => $config['ports']['realtime']
        ];

        return str_replace(array_keys($replacements), array_values($replacements), $template);
    }

    public function generateEnvFile(array $config): string
    {
        $template = file_get_contents($this->templatesDir . '/.env.template');

        $replacements = [
            '{{POSTGRES_PASSWORD}}' => $config['postgres_password'],
            '{{JWT_SECRET}}' => $config['jwt_secret'],
            '{{ANON_KEY}}' => $config['anon_key'],
            '{{SERVICE_ROLE_KEY}}' => $config['service_role_key'],
            '{{POSTGRES_PORT}}' => $config['ports']['postgres'] ?? 5432,
            '{{STUDIO_PORT}}' => $config['ports']['studio'],
            '{{KONG_PORT}}' => $config['ports']['kong'],
            '{{AUTH_PORT}}' => $config['ports']['auth'],
            '{{REALTIME_PORT}}' => $config['ports']['realtime'],
            '{{DOMAIN}}' => $config['domain']
        ];

        return str_replace(array_keys($replacements), array_values($replacements), $template);
    }

    public function saveProjectFiles(string $slug, string $dockerCompose, string $envFile, array $metadata): bool
    {
        $projectPath = $this->projectsDir . '/' . $slug;

        // Save docker-compose.yml
        if (file_put_contents("$projectPath/docker-compose.yml", $dockerCompose) === false) {
            throw new \RuntimeException("Failed to save docker-compose.yml");
        }

        // Save .env
        if (file_put_contents("$projectPath/.env", $envFile) === false) {
            throw new \RuntimeException("Failed to save .env file");
        }

        // Save metadata.json
        if (file_put_contents("$projectPath/metadata.json", json_encode($metadata, JSON_PRETTY_PRINT)) === false) {
            throw new \RuntimeException("Failed to save metadata.json");
        }

        return true;
    }

    public function duplicateProject(string $sourceSlug, string $targetSlug): bool
    {
        $sourcePath = $this->projectsDir . '/' . $sourceSlug;
        $targetPath = $this->projectsDir . '/' . $targetSlug;

        if (!is_dir($sourcePath)) {
            throw new \RuntimeException("Source project not found: $sourceSlug");
        }

        if (is_dir($targetPath)) {
            throw new \RuntimeException("Target project already exists: $targetSlug");
        }

        // Copy directory recursively (excluding volumes)
        $this->recursiveCopy($sourcePath, $targetPath, ['volumes']);

        return true;
    }

    private function recursiveCopy(string $source, string $dest, array $exclude = []): void
    {
        $dir = opendir($source);
        @mkdir($dest, 0755, true);

        while (($file = readdir($dir)) !== false) {
            if ($file === '.' || $file === '..' || in_array($file, $exclude)) {
                continue;
            }

            $srcPath = $source . '/' . $file;
            $destPath = $dest . '/' . $file;

            if (is_dir($srcPath)) {
                $this->recursiveCopy($srcPath, $destPath, $exclude);
            } else {
                copy($srcPath, $destPath);
            }
        }

        closedir($dir);
    }

    public function deleteProjectFiles(string $slug): bool
    {
        $projectPath = $this->projectsDir . '/' . $slug;

        if (!is_dir($projectPath)) {
            return true; // Already deleted
        }

        // Remove directory recursively
        $this->recursiveDelete($projectPath);

        return true;
    }

    private function recursiveDelete(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }

        $files = array_diff(scandir($dir), ['.', '..']);

        foreach ($files as $file) {
            $path = $dir . '/' . $file;
            is_dir($path) ? $this->recursiveDelete($path) : unlink($path);
        }

        rmdir($dir);
    }
}
