# TM Cloud - API Examples

Ejemplos prácticos de uso de la API de TM Cloud.

## Base URL

```
http://your-server-ip:8080/api
```

## Endpoints

### 1. Health Check

Verificar que la API está funcionando.

```bash
curl http://localhost:8080/api/health
```

**Respuesta:**
```json
{
  "success": true,
  "message": "TM Cloud API is running",
  "timestamp": "2026-07-01 12:00:00"
}
```

---

### 2. Listar Proyectos

Obtener todos los proyectos.

```bash
curl http://localhost:8080/api/projects
```

**Con filtros:**
```bash
# Solo activos
curl http://localhost:8080/api/projects?status=active

# Búsqueda
curl http://localhost:8080/api/projects?search=empresa

# Combinado
curl http://localhost:8080/api/projects?status=active&search=test
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Mi Empresa SRL",
      "slug": "miempresa",
      "domain": "miempresa.tmcloud.com",
      "status": "active",
      "studio_port": 8100,
      "kong_port": 8101,
      "auth_port": 8102,
      "realtime_port": 8103,
      "postgres_version": "15",
      "max_connections": 100,
      "max_storage_gb": 10,
      "created_at": "2026-07-01 10:00:00",
      "updated_at": "2026-07-01 10:00:00",
      "cpu_limit": "2",
      "memory_limit": "2g",
      "client_name": "Juan Pérez",
      "client_email": "juan@miempresa.com",
      "client_company": "Mi Empresa SRL"
    }
  ]
}
```

---

### 3. Ver Detalles de Proyecto

Obtener información detallada de un proyecto específico.

```bash
curl http://localhost:8080/api/projects/1
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Mi Empresa SRL",
    "slug": "miempresa",
    "domain": "miempresa.tmcloud.com",
    "status": "active",
    "containers": [
      {
        "name": "miempresa_postgres",
        "service": "db",
        "status": "running",
        "health": "healthy"
      },
      {
        "name": "miempresa_studio",
        "service": "studio",
        "status": "running",
        "health": "none"
      }
    ]
  }
}
```

---

### 4. Crear Proyecto

Crear un nuevo proyecto Supabase.

```bash
curl -X POST http://localhost:8080/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nuevo Proyecto",
    "slug": "nuevo-proyecto",
    "domain": "nuevo.tmcloud.com",
    "postgres_version": "15",
    "max_connections": 100,
    "max_storage_gb": 10,
    "cpu_limit": "2",
    "memory_limit": "2g",
    "client_name": "María García",
    "client_email": "maria@example.com",
    "client_company": "Tech Corp"
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Project created successfully",
  "data": {
    "project": {
      "id": 2,
      "uuid": "660e8400-e29b-41d4-a716-446655440001",
      "name": "Nuevo Proyecto",
      "slug": "nuevo-proyecto",
      "domain": "nuevo.tmcloud.com",
      "status": "active",
      "studio_port": 8104,
      "kong_port": 8105,
      "auth_port": 8106,
      "realtime_port": 8107
    },
    "url": "https://nuevo.tmcloud.com",
    "studio_url": "https://nuevo.tmcloud.com/studio",
    "credentials": {
      "anon_key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "service_role_key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

**Errores comunes:**

```bash
# Slug ya existe
{
  "success": false,
  "error": "Slug already exists"
}

# Validación fallida
{
  "success": false,
  "error": "Validation failed",
  "errors": {
    "name": ["name is required"],
    "slug": ["slug must be at least 3 characters"]
  }
}
```

---

### 5. Actualizar Proyecto

Actualizar configuración de un proyecto existente.

```bash
curl -X PUT http://localhost:8080/api/projects/1 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mi Empresa SRL - Actualizado",
    "max_connections": 200,
    "max_storage_gb": 20,
    "client_name": "Juan Pérez (Admin)"
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Project updated successfully",
  "data": {
    "id": 1,
    "name": "Mi Empresa SRL - Actualizado",
    "max_connections": 200,
    "max_storage_gb": 20,
    "client_name": "Juan Pérez (Admin)",
    "updated_at": "2026-07-01 15:30:00"
  }
}
```

---

### 6. Reiniciar Proyecto

Reiniciar todos los contenedores de un proyecto.

```bash
curl -X POST http://localhost:8080/api/projects/1/restart
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Project restarted successfully"
}
```

---

### 7. Suspender Proyecto

Detener todos los contenedores sin eliminarlos.

```bash
curl -X POST http://localhost:8080/api/projects/1/suspend
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Project suspended successfully"
}
```

---

### 8. Activar Proyecto

Iniciar contenedores de un proyecto suspendido.

```bash
curl -X POST http://localhost:8080/api/projects/1/activate
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Project activated successfully"
}
```

---

### 9. Ver Logs

Obtener logs de un servicio específico.

```bash
# Logs de PostgreSQL (últimas 100 líneas)
curl http://localhost:8080/api/projects/1/logs?service=db&lines=100

# Logs de Studio
curl http://localhost:8080/api/projects/1/logs?service=studio&lines=50

# Logs de Auth
curl http://localhost:8080/api/projects/1/logs?service=auth&lines=200
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "service": "db",
    "logs": "2026-07-01 10:00:00 UTC [1] LOG:  database system was shut down at 2026-07-01 09:59:58 UTC\n2026-07-01 10:00:00 UTC [1] LOG:  database system is ready to accept connections\n..."
  }
}
```

---

### 10. Ver Estadísticas

Obtener estadísticas de uso de recursos.

```bash
curl http://localhost:8080/api/projects/1/stats
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "container": "miempresa_postgres",
      "cpu": "2.5%",
      "memory": "256MiB / 2GiB",
      "network": "1.2MB / 850KB",
      "block_io": "45MB / 12MB"
    },
    {
      "container": "miempresa_studio",
      "cpu": "0.8%",
      "memory": "128MiB / 2GiB",
      "network": "450KB / 280KB",
      "block_io": "8MB / 2MB"
    }
  ]
}
```

---

### 11. Eliminar Proyecto

Eliminar proyecto completamente (contenedores, volúmenes, archivos).

```bash
curl -X DELETE http://localhost:8080/api/projects/1
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

---

## Ejemplos con JavaScript/TypeScript

### Usando Fetch

```javascript
// Crear proyecto
async function createProject(data) {
  const response = await fetch('http://localhost:8080/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })

  return await response.json()
}

// Uso
const newProject = await createProject({
  name: 'Mi Proyecto',
  slug: 'mi-proyecto',
  domain: 'proyecto.tmcloud.com'
})

console.log(newProject.data.credentials)
```

### Usando Axios

```javascript
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8080/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Listar proyectos
const projects = await api.get('/projects')
console.log(projects.data)

// Crear proyecto
const newProject = await api.post('/projects', {
  name: 'Nuevo Proyecto',
  slug: 'nuevo',
  domain: 'nuevo.tmcloud.com'
})

// Reiniciar
await api.post(`/projects/${newProject.data.project.id}/restart`)

// Eliminar
await api.delete(`/projects/${newProject.data.project.id}`)
```

---

## Ejemplos con Python

### Usando requests

```python
import requests

BASE_URL = 'http://localhost:8080/api'

# Listar proyectos
response = requests.get(f'{BASE_URL}/projects')
projects = response.json()

# Crear proyecto
new_project = requests.post(f'{BASE_URL}/projects', json={
    'name': 'Python Project',
    'slug': 'python-project',
    'domain': 'python.tmcloud.com',
    'client_name': 'Python Developer'
})

project_id = new_project.json()['data']['project']['id']

# Ver logs
logs = requests.get(f'{BASE_URL}/projects/{project_id}/logs', params={
    'service': 'db',
    'lines': 50
})

print(logs.json()['data']['logs'])

# Eliminar
requests.delete(f'{BASE_URL}/projects/{project_id}')
```

---

## Ejemplos con PHP

```php
<?php

$baseUrl = 'http://localhost:8080/api';

// Listar proyectos
$projects = file_get_contents("$baseUrl/projects");
$projectsData = json_decode($projects, true);

// Crear proyecto
$data = [
    'name' => 'PHP Project',
    'slug' => 'php-project',
    'domain' => 'php.tmcloud.com'
];

$options = [
    'http' => [
        'method' => 'POST',
        'header' => 'Content-Type: application/json',
        'content' => json_encode($data)
    ]
];

$context = stream_context_create($options);
$result = file_get_contents("$baseUrl/projects", false, $context);
$newProject = json_decode($result, true);

echo "Project created: " . $newProject['data']['project']['id'];

// Reiniciar
$projectId = $newProject['data']['project']['id'];
$options['http']['method'] = 'POST';
$context = stream_context_create($options);
file_get_contents("$baseUrl/projects/$projectId/restart", false, $context);
```

---

## Webhooks (Futuro)

### Configurar webhook

```bash
curl -X POST http://localhost:8080/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://myapp.com/webhook",
    "events": ["project.created", "project.deleted", "backup.completed"]
  }'
```

### Payload de ejemplo

```json
{
  "event": "project.created",
  "timestamp": "2026-07-01T10:00:00Z",
  "data": {
    "project_id": 1,
    "project_name": "Mi Proyecto",
    "slug": "mi-proyecto",
    "domain": "proyecto.tmcloud.com"
  }
}
```

---

## Rate Limiting (Futuro)

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1625140800
```

---

## Autenticación (Futuro)

```bash
# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "password123"
  }'

# Respuesta
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600
}

# Usar token
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  http://localhost:8080/api/projects
```

---

## Error Handling

### Códigos de estado HTTP

| Código | Significado |
|--------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Not Found |
| 422 | Validation Error |
| 500 | Server Error |

### Formato de errores

```json
{
  "success": false,
  "error": "Error message"
}
```

Con detalles adicionales:

```json
{
  "success": false,
  "error": "Validation failed",
  "errors": {
    "field1": ["error1", "error2"],
    "field2": ["error1"]
  }
}
```

---

## Testing con cURL

### Script completo de prueba

```bash
#!/bin/bash

API="http://localhost:8080/api"

echo "1. Health check..."
curl -s $API/health | jq

echo -e "\n2. Creating project..."
PROJECT=$(curl -s -X POST $API/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Project",
    "slug": "test-project",
    "domain": "test.tmcloud.com"
  }' | jq)

echo $PROJECT | jq

PROJECT_ID=$(echo $PROJECT | jq -r '.data.project.id')

echo -e "\n3. Getting project details..."
curl -s $API/projects/$PROJECT_ID | jq

echo -e "\n4. Getting logs..."
curl -s "$API/projects/$PROJECT_ID/logs?service=db&lines=10" | jq -r '.data.logs'

echo -e "\n5. Suspending project..."
curl -s -X POST $API/projects/$PROJECT_ID/suspend | jq

echo -e "\n6. Activating project..."
curl -s -X POST $API/projects/$PROJECT_ID/activate | jq

echo -e "\n7. Deleting project..."
curl -s -X DELETE $API/projects/$PROJECT_ID | jq
```

---

Guarda este script como `test-api.sh`, dale permisos de ejecución y ejecútalo:

```bash
chmod +x test-api.sh
./test-api.sh
```

---

**Última actualización**: 2026-07-01
