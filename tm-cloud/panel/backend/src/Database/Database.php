<?php

namespace TMCloud\Database;

use PDO;
use PDOException;

class Database
{
    private static ?PDO $instance = null;
    private string $dbPath;

    private function __construct()
    {
        $this->dbPath = __DIR__ . '/../../storage/database/tm-cloud.db';
        $this->ensureDirectoryExists();
    }

    private function ensureDirectoryExists(): void
    {
        $dir = dirname($this->dbPath);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
    }

    public static function getInstance(): PDO
    {
        if (self::$instance === null) {
            $db = new self();
            try {
                self::$instance = new PDO('sqlite:' . $db->dbPath);
                self::$instance->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                self::$instance->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

                // Enable foreign keys
                self::$instance->exec('PRAGMA foreign_keys = ON');

            } catch (PDOException $e) {
                throw new \RuntimeException('Database connection failed: ' . $e->getMessage());
            }
        }

        return self::$instance;
    }

    public static function migrate(): void
    {
        $db = self::getInstance();

        // Create projects table
        $db->exec("
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                domain TEXT UNIQUE,
                status TEXT DEFAULT 'active',

                studio_port INTEGER UNIQUE,
                kong_port INTEGER UNIQUE,
                auth_port INTEGER UNIQUE,
                realtime_port INTEGER UNIQUE,

                postgres_password TEXT NOT NULL,
                jwt_secret TEXT NOT NULL,
                anon_key TEXT NOT NULL,
                service_role_key TEXT NOT NULL,

                postgres_version TEXT DEFAULT '15',
                max_connections INTEGER DEFAULT 100,
                max_storage_gb INTEGER DEFAULT 10,

                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_backup_at DATETIME,

                cpu_limit TEXT DEFAULT '2',
                memory_limit TEXT DEFAULT '2g',

                client_name TEXT,
                client_email TEXT,
                client_company TEXT
            )
        ");

        $db->exec("CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_projects_domain ON projects(domain)");

        // Create backups table
        $db->exec("
            CREATE TABLE IF NOT EXISTS backups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                project_id INTEGER NOT NULL,

                type TEXT NOT NULL,
                schedule TEXT,

                file_path TEXT NOT NULL,
                file_size INTEGER,

                status TEXT DEFAULT 'pending',
                error_message TEXT,

                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,

                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
        ");

        $db->exec("CREATE INDEX IF NOT EXISTS idx_backups_project ON backups(project_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_backups_status ON backups(status)");

        // Create monitoring_logs table
        $db->exec("
            CREATE TABLE IF NOT EXISTS monitoring_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,

                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,

                cpu_usage REAL,
                memory_usage REAL,
                disk_usage REAL,

                containers_running INTEGER,
                containers_total INTEGER,

                request_count INTEGER DEFAULT 0,
                error_count INTEGER DEFAULT 0,

                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
        ");

        $db->exec("CREATE INDEX IF NOT EXISTS idx_monitoring_project ON monitoring_logs(project_id)");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_monitoring_timestamp ON monitoring_logs(timestamp)");

        // Create port_allocations table
        $db->exec("
            CREATE TABLE IF NOT EXISTS port_allocations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                port INTEGER UNIQUE NOT NULL,
                service TEXT NOT NULL,
                project_id INTEGER,
                allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
            )
        ");

        $db->exec("CREATE INDEX IF NOT EXISTS idx_port_allocations_port ON port_allocations(port)");

        // Create users table
        $db->exec("
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'admin',

                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login_at DATETIME
            )
        ");

        echo "Database migrations completed successfully.\n";
    }
}
