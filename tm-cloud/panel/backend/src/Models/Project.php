<?php

namespace TMCloud\Models;

use TMCloud\Database\Database;
use PDO;

class Project
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    public function create(array $data): int
    {
        $uuid = $this->generateUuid();

        $stmt = $this->db->prepare("
            INSERT INTO projects (
                uuid, name, slug, domain, status,
                studio_port, kong_port, auth_port, realtime_port,
                postgres_password, jwt_secret, anon_key, service_role_key,
                postgres_version, max_connections, max_storage_gb,
                cpu_limit, memory_limit,
                client_name, client_email, client_company
            ) VALUES (
                :uuid, :name, :slug, :domain, :status,
                :studio_port, :kong_port, :auth_port, :realtime_port,
                :postgres_password, :jwt_secret, :anon_key, :service_role_key,
                :postgres_version, :max_connections, :max_storage_gb,
                :cpu_limit, :memory_limit,
                :client_name, :client_email, :client_company
            )
        ");

        $stmt->execute([
            'uuid' => $uuid,
            'name' => $data['name'],
            'slug' => $data['slug'],
            'domain' => $data['domain'] ?? null,
            'status' => $data['status'] ?? 'active',
            'studio_port' => $data['studio_port'],
            'kong_port' => $data['kong_port'],
            'auth_port' => $data['auth_port'],
            'realtime_port' => $data['realtime_port'],
            'postgres_password' => $data['postgres_password'],
            'jwt_secret' => $data['jwt_secret'],
            'anon_key' => $data['anon_key'],
            'service_role_key' => $data['service_role_key'],
            'postgres_version' => $data['postgres_version'] ?? '15',
            'max_connections' => $data['max_connections'] ?? 100,
            'max_storage_gb' => $data['max_storage_gb'] ?? 10,
            'cpu_limit' => $data['cpu_limit'] ?? '2',
            'memory_limit' => $data['memory_limit'] ?? '2g',
            'client_name' => $data['client_name'] ?? null,
            'client_email' => $data['client_email'] ?? null,
            'client_company' => $data['client_company'] ?? null
        ]);

        return (int) $this->db->lastInsertId();
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->db->prepare("SELECT * FROM projects WHERE id = :id");
        $stmt->execute(['id' => $id]);
        $result = $stmt->fetch();

        return $result ?: null;
    }

    public function findBySlug(string $slug): ?array
    {
        $stmt = $this->db->prepare("SELECT * FROM projects WHERE slug = :slug");
        $stmt->execute(['slug' => $slug]);
        $result = $stmt->fetch();

        return $result ?: null;
    }

    public function findAll(array $filters = []): array
    {
        $sql = "SELECT * FROM projects WHERE 1=1";
        $params = [];

        if (!empty($filters['status'])) {
            $sql .= " AND status = :status";
            $params['status'] = $filters['status'];
        }

        if (!empty($filters['search'])) {
            $sql .= " AND (name LIKE :search OR slug LIKE :search OR domain LIKE :search)";
            $params['search'] = '%' . $filters['search'] . '%';
        }

        $sql .= " ORDER BY created_at DESC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    public function update(int $id, array $data): bool
    {
        $fields = [];
        $params = ['id' => $id];

        $allowedFields = [
            'name', 'domain', 'status', 'max_connections', 'max_storage_gb',
            'cpu_limit', 'memory_limit', 'client_name', 'client_email', 'client_company'
        ];

        foreach ($allowedFields as $field) {
            if (isset($data[$field])) {
                $fields[] = "$field = :$field";
                $params[$field] = $data[$field];
            }
        }

        if (empty($fields)) {
            return true;
        }

        $fields[] = "updated_at = CURRENT_TIMESTAMP";

        $sql = "UPDATE projects SET " . implode(', ', $fields) . " WHERE id = :id";

        $stmt = $this->db->prepare($sql);
        return $stmt->execute($params);
    }

    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare("DELETE FROM projects WHERE id = :id");
        return $stmt->execute(['id' => $id]);
    }

    public function updateStatus(int $id, string $status): bool
    {
        $stmt = $this->db->prepare("
            UPDATE projects
            SET status = :status, updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
        ");

        return $stmt->execute([
            'status' => $status,
            'id' => $id
        ]);
    }

    public function exists(string $field, string $value): bool
    {
        $stmt = $this->db->prepare("SELECT COUNT(*) as count FROM projects WHERE $field = :value");
        $stmt->execute(['value' => $value]);
        $result = $stmt->fetch();

        return $result['count'] > 0;
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
