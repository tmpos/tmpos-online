<?php

namespace TMCloud\Services;

use TMCloud\Database\Database;
use PDO;

class PortManager
{
    private PDO $db;
    private int $portRangeStart = 8000;
    private int $portRangeEnd = 9000;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    public function allocatePorts(int $projectId, int $count = 4): array
    {
        $availablePorts = $this->getAvailablePorts($count);

        if (count($availablePorts) < $count) {
            throw new \RuntimeException('Not enough available ports');
        }

        $services = ['studio', 'kong', 'auth', 'realtime'];
        $allocated = [];

        foreach ($services as $index => $service) {
            $port = $availablePorts[$index];

            $stmt = $this->db->prepare("
                INSERT INTO port_allocations (port, service, project_id)
                VALUES (:port, :service, :project_id)
            ");

            $stmt->execute([
                'port' => $port,
                'service' => $service,
                'project_id' => $projectId
            ]);

            $allocated[$service] = $port;
        }

        return $allocated;
    }

    public function releasePorts(int $projectId): bool
    {
        $stmt = $this->db->prepare("DELETE FROM port_allocations WHERE project_id = :project_id");
        return $stmt->execute(['project_id' => $projectId]);
    }

    public function isPortAvailable(int $port): bool
    {
        $stmt = $this->db->prepare("SELECT COUNT(*) as count FROM port_allocations WHERE port = :port");
        $stmt->execute(['port' => $port]);
        $result = $stmt->fetch();

        return $result['count'] == 0;
    }

    public function getAvailablePorts(int $count): array
    {
        $stmt = $this->db->query("SELECT port FROM port_allocations ORDER BY port");
        $usedPorts = $stmt->fetchAll(PDO::FETCH_COLUMN);

        $available = [];
        for ($port = $this->portRangeStart; $port <= $this->portRangeEnd; $port++) {
            if (!in_array($port, $usedPorts)) {
                $available[] = $port;
                if (count($available) >= $count) {
                    break;
                }
            }
        }

        return $available;
    }

    public function getPortsForProject(int $projectId): array
    {
        $stmt = $this->db->prepare("
            SELECT service, port
            FROM port_allocations
            WHERE project_id = :project_id
        ");
        $stmt->execute(['project_id' => $projectId]);

        $ports = [];
        while ($row = $stmt->fetch()) {
            $ports[$row['service']] = $row['port'];
        }

        return $ports;
    }
}
