<?php

namespace TMCloud\Services;

use TMCloud\Database\Database;
use PDO;

class BackupService
{
    private PDO $db;
    private string $backupsDir;
    private string $projectsDir;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->backupsDir = __DIR__ . '/../../../backups';
        $this->projectsDir = __DIR__ . '/../../../projects';
    }

    public function createBackup(int $projectId, string $type = 'manual'): string
    {
        // Get project info
        $stmt = $this->db->prepare("SELECT * FROM projects WHERE id = :id");
        $stmt->execute(['id' => $projectId]);
        $project = $stmt->fetch();

        if (!$project) {
            throw new \RuntimeException("Project not found: $projectId");
        }

        $slug = $project['slug'];
        $timestamp = date('Y-m-d_H-i-s');
        $backupUuid = $this->generateUuid();

        // Create backup directory
        $projectBackupDir = $this->backupsDir . '/' . $slug;
        if (!is_dir($projectBackupDir)) {
            mkdir($projectBackupDir, 0755, true);
        }

        // Backup file paths
        $sqlBackupFile = "$projectBackupDir/{$timestamp}_database.sql.gz";
        $filesBackupFile = "$projectBackupDir/{$timestamp}_files.tar.gz";

        // Create backup record
        $stmt = $this->db->prepare("
            INSERT INTO backups (uuid, project_id, type, file_path, status)
            VALUES (:uuid, :project_id, :type, :file_path, 'pending')
        ");

        $stmt->execute([
            'uuid' => $backupUuid,
            'project_id' => $projectId,
            'type' => $type,
            'file_path' => $sqlBackupFile
        ]);

        $backupId = $this->db->lastInsertId();

        try {
            // Backup PostgreSQL database
            $this->backupPostgres($slug, $sqlBackupFile, $project['postgres_password']);

            // Backup storage files
            $this->backupFiles($slug, $filesBackupFile);

            // Calculate total size
            $totalSize = filesize($sqlBackupFile) + filesize($filesBackupFile);

            // Update backup record
            $stmt = $this->db->prepare("
                UPDATE backups
                SET status = 'completed', file_size = :size, completed_at = CURRENT_TIMESTAMP
                WHERE id = :id
            ");

            $stmt->execute([
                'size' => $totalSize,
                'id' => $backupId
            ]);

            // Update project last_backup_at
            $stmt = $this->db->prepare("
                UPDATE projects
                SET last_backup_at = CURRENT_TIMESTAMP
                WHERE id = :id
            ");

            $stmt->execute(['id' => $projectId]);

            return $backupUuid;

        } catch (\Exception $e) {
            // Update backup record with error
            $stmt = $this->db->prepare("
                UPDATE backups
                SET status = 'failed', error_message = :error
                WHERE id = :id
            ");

            $stmt->execute([
                'error' => $e->getMessage(),
                'id' => $backupId
            ]);

            throw $e;
        }
    }

    private function backupPostgres(string $slug, string $outputFile, string $password): void
    {
        $projectPath = $this->projectsDir . '/' . $slug;

        $cmd = sprintf(
            "cd '%s' && docker-compose exec -T -e PGPASSWORD='%s' db pg_dump -U postgres postgres | gzip > '%s' 2>&1",
            $projectPath,
            $password,
            $outputFile
        );

        exec($cmd, $output, $returnCode);

        if ($returnCode !== 0) {
            throw new \RuntimeException("PostgreSQL backup failed: " . implode("\n", $output));
        }
    }

    private function backupFiles(string $slug, string $outputFile): void
    {
        $projectPath = $this->projectsDir . '/' . $slug;
        $volumesPath = "$projectPath/volumes";

        $cmd = sprintf(
            "tar -czf '%s' -C '%s' storage 2>&1",
            $outputFile,
            $volumesPath
        );

        exec($cmd, $output, $returnCode);

        if ($returnCode !== 0) {
            throw new \RuntimeException("Files backup failed: " . implode("\n", $output));
        }
    }

    public function restoreBackup(int $projectId, string $backupUuid): bool
    {
        // Get backup info
        $stmt = $this->db->prepare("
            SELECT b.*, p.slug, p.postgres_password
            FROM backups b
            JOIN projects p ON b.project_id = p.id
            WHERE b.uuid = :uuid AND b.project_id = :project_id
        ");

        $stmt->execute([
            'uuid' => $backupUuid,
            'project_id' => $projectId
        ]);

        $backup = $stmt->fetch();

        if (!$backup) {
            throw new \RuntimeException("Backup not found");
        }

        if ($backup['status'] !== 'completed') {
            throw new \RuntimeException("Backup is not completed");
        }

        $slug = $backup['slug'];
        $sqlBackupFile = $backup['file_path'];
        $filesBackupFile = str_replace('_database.sql.gz', '_files.tar.gz', $sqlBackupFile);

        // Restore PostgreSQL database
        $this->restorePostgres($slug, $sqlBackupFile, $backup['postgres_password']);

        // Restore storage files
        if (file_exists($filesBackupFile)) {
            $this->restoreFiles($slug, $filesBackupFile);
        }

        return true;
    }

    private function restorePostgres(string $slug, string $backupFile, string $password): void
    {
        $projectPath = $this->projectsDir . '/' . $slug;

        $cmd = sprintf(
            "gunzip -c '%s' | cd '%s' && docker-compose exec -T -e PGPASSWORD='%s' db psql -U postgres postgres 2>&1",
            $backupFile,
            $projectPath,
            $password
        );

        exec($cmd, $output, $returnCode);

        if ($returnCode !== 0) {
            throw new \RuntimeException("PostgreSQL restore failed: " . implode("\n", $output));
        }
    }

    private function restoreFiles(string $slug, string $backupFile): void
    {
        $projectPath = $this->projectsDir . '/' . $slug;
        $volumesPath = "$projectPath/volumes";

        $cmd = sprintf(
            "tar -xzf '%s' -C '%s' 2>&1",
            $backupFile,
            $volumesPath
        );

        exec($cmd, $output, $returnCode);

        if ($returnCode !== 0) {
            throw new \RuntimeException("Files restore failed: " . implode("\n", $output));
        }
    }

    public function getBackupList(int $projectId): array
    {
        $stmt = $this->db->prepare("
            SELECT * FROM backups
            WHERE project_id = :project_id
            ORDER BY created_at DESC
        ");

        $stmt->execute(['project_id' => $projectId]);

        return $stmt->fetchAll();
    }

    public function deleteOldBackups(int $projectId, int $keepCount = 30): int
    {
        // Get old backups
        $stmt = $this->db->prepare("
            SELECT * FROM backups
            WHERE project_id = :project_id AND status = 'completed'
            ORDER BY created_at DESC
            LIMIT -1 OFFSET :offset
        ");

        $stmt->execute([
            'project_id' => $projectId,
            'offset' => $keepCount
        ]);

        $oldBackups = $stmt->fetchAll();
        $deletedCount = 0;

        foreach ($oldBackups as $backup) {
            // Delete files
            if (file_exists($backup['file_path'])) {
                unlink($backup['file_path']);
            }

            $filesBackup = str_replace('_database.sql.gz', '_files.tar.gz', $backup['file_path']);
            if (file_exists($filesBackup)) {
                unlink($filesBackup);
            }

            // Delete record
            $stmt = $this->db->prepare("DELETE FROM backups WHERE id = :id");
            $stmt->execute(['id' => $backup['id']]);

            $deletedCount++;
        }

        return $deletedCount;
    }

    public function scheduleBackup(int $projectId, string $schedule): bool
    {
        // This would integrate with cron or a task scheduler
        // For now, just create a placeholder record

        $backupUuid = $this->generateUuid();

        $stmt = $this->db->prepare("
            INSERT INTO backups (uuid, project_id, type, schedule, file_path, status)
            VALUES (:uuid, :project_id, 'automatic', :schedule, '', 'pending')
        ");

        return $stmt->execute([
            'uuid' => $backupUuid,
            'project_id' => $projectId,
            'schedule' => $schedule
        ]);
    }

    private function generateUuid(): string
    {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff)
        );
    }
}
