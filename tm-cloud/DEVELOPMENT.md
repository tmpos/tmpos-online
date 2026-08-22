# TM Cloud - Development Guide

Guía para desarrollar y contribuir a TM Cloud.

## Requisitos de Desarrollo

- Docker & Docker Compose
- PHP 8.3+
- Composer
- Node.js 18+
- npm o yarn
- Git

## Setup Local

### 1. Clonar el repositorio

```bash
git clone <repository-url> tm-cloud
cd tm-cloud
```

### 2. Backend Setup

```bash
cd panel/backend

# Instalar dependencias
composer install

# Crear directorios necesarios
mkdir -p storage/database storage/logs

# Ejecutar migraciones
composer migrate

# O manualmente:
php -r "require 'vendor/autoload.php'; \TMCloud\Database\Database::migrate();"
```

### 3. Frontend Setup

```bash
cd panel/frontend

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

### 4. Servidor PHP de Desarrollo

```bash
cd panel/backend/public

# Iniciar servidor en puerto 8080
php -S localhost:8080
```

### 5. Acceder a la aplicación

- Frontend: http://localhost:5173
- API: http://localhost:8080

## Estructura del Proyecto

```
panel/
├── backend/
│   ├── public/              # Entry point
│   │   └── index.php        # API router
│   ├── src/
│   │   ├── Controllers/     # Controladores API
│   │   ├── Services/        # Lógica de negocio
│   │   ├── Models/          # Modelos de datos
│   │   ├── Database/        # Conexión y migraciones
│   │   ├── Middleware/      # Middleware HTTP
│   │   └── Utils/           # Utilidades
│   ├── config/              # Archivos de configuración
│   ├── storage/             # Datos y logs
│   └── templates/           # Plantillas Supabase
│
└── frontend/
    ├── src/
    │   ├── components/      # Componentes Vue
    │   ├── views/           # Vistas/páginas
    │   ├── services/        # Servicios API
    │   ├── stores/          # Pinia stores
    │   └── router/          # Vue Router
    └── public/              # Archivos estáticos
```

## Comandos Útiles

### Backend

```bash
# Instalar dependencias
composer install

# Actualizar dependencias
composer update

# Ejecutar migraciones
composer migrate

# Listar proyectos (requiere DB inicializada)
php scripts/list-projects.php

# Autoloader dump
composer dump-autoload
```

### Frontend

```bash
# Instalar dependencias
npm install

# Desarrollo
npm run dev

# Build para producción
npm run build

# Preview build
npm run preview
```

## Testing

### Backend Tests (Futuro)

```bash
# PHPUnit
composer test

# Con coverage
composer test-coverage
```

### Frontend Tests (Futuro)

```bash
# Vitest
npm run test

# E2E con Cypress
npm run test:e2e
```

## Código de Estilo

### PHP (PSR-12)

```php
<?php

namespace TMCloud\Controllers;

use TMCloud\Utils\Response;

class ExampleController
{
    public function index(): void
    {
        Response::json(['success' => true]);
    }
}
```

### TypeScript/Vue

```typescript
// TypeScript
interface Project {
  id: number
  name: string
  slug: string
}

// Vue 3 Composition API
<script setup lang="ts">
import { ref, computed } from 'vue'

const count = ref(0)
const doubled = computed(() => count.value * 2)
</script>
```

## Base de Datos

### Agregar una nueva tabla

1. Editar `src/Database/Database.php`
2. Agregar SQL en el método `migrate()`

```php
$db->exec("
    CREATE TABLE IF NOT EXISTS new_table (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
");
```

3. Ejecutar migraciones

```bash
composer migrate
```

### Consultar la base de datos

```bash
# SQLite CLI
sqlite3 panel/backend/storage/database/tm-cloud.db

# Listar tablas
.tables

# Ver estructura
.schema projects

# Consulta
SELECT * FROM projects;

# Salir
.exit
```

## Agregar una nueva ruta API

### 1. Crear el controlador

```php
// src/Controllers/ExampleController.php
<?php

namespace TMCloud\Controllers;

use TMCloud\Utils\Response;

class ExampleController
{
    public function index(): void
    {
        Response::json([
            'success' => true,
            'data' => []
        ]);
    }

    public function show(int $id): void
    {
        Response::json([
            'success' => true,
            'data' => ['id' => $id]
        ]);
    }
}
```

### 2. Registrar la ruta

```php
// public/index.php
use TMCloud\Controllers\ExampleController;

// ...

if (preg_match('#^/examples$#', $path)) {
    $controller = new ExampleController();

    if ($method === 'GET') {
        $controller->index();
    }
}
```

### 3. Crear servicio en frontend

```typescript
// src/services/exampleService.ts
import api from './api'

interface Example {
  id: number
  name: string
}

class ExampleService {
  async getAll(): Promise<Example[]> {
    const response = await api.get<{ data: Example[] }>('/examples')
    return response.data
  }

  async getById(id: number): Promise<Example> {
    const response = await api.get<{ data: Example }>(`/examples/${id}`)
    return response.data
  }
}

export default new ExampleService()
```

## Debugging

### Backend

```php
// Logger
use TMCloud\Utils\Logger;

Logger::info('Debug message', ['data' => $someData]);
Logger::error('Error occurred', ['error' => $e->getMessage()]);

// Ver logs
tail -f panel/backend/storage/logs/*.log
```

### Frontend

```typescript
// Console
console.log('Debug:', data)
console.error('Error:', error)

// Vue Devtools
// Instalar extensión de navegador
```

## Variables de Entorno

### Backend (Futuro)

```env
# .env
APP_ENV=development
APP_DEBUG=true
DB_PATH=/path/to/database.db
```

### Frontend

```env
# .env.local
VITE_API_URL=http://localhost:8080
VITE_APP_TITLE=TM Cloud Dev
```

## Docker para Desarrollo

### Crear contenedor de desarrollo

```dockerfile
# Dockerfile.dev
FROM php:8.3-cli

RUN apt-get update && apt-get install -y \
    sqlite3 \
    git \
    unzip

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /app

CMD ["php", "-S", "0.0.0.0:8080", "-t", "public"]
```

### Docker Compose para desarrollo

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  api:
    build:
      context: ./panel/backend
      dockerfile: Dockerfile.dev
    ports:
      - "8080:8080"
    volumes:
      - ./panel/backend:/app

  frontend:
    image: node:18
    working_dir: /app
    volumes:
      - ./panel/frontend:/app
    ports:
      - "5173:5173"
    command: npm run dev
```

```bash
# Iniciar
docker-compose -f docker-compose.dev.yml up
```

## Git Workflow

### Branches

- `main` - Producción
- `develop` - Desarrollo
- `feature/*` - Nuevas funcionalidades
- `fix/*` - Correcciones
- `hotfix/*` - Correcciones urgentes

### Commits

```bash
# Formato
<type>(<scope>): <subject>

# Ejemplos
feat(projects): add project duplication
fix(backup): resolve restore error
docs(readme): update installation steps
refactor(api): improve error handling
```

### Pull Requests

1. Crear branch desde `develop`
2. Hacer cambios
3. Commit y push
4. Crear PR hacia `develop`
5. Code review
6. Merge

## Deployment

### Build para producción

```bash
# Backend
cd panel/backend
composer install --no-dev --optimize-autoloader

# Frontend
cd panel/frontend
npm run build
```

### Deploy a servidor

```bash
# Rsync
rsync -avz --exclude node_modules --exclude .git . user@server:/var/tm-cloud/

# SSH y restart
ssh user@server 'sudo systemctl restart nginx php8.3-fpm'
```

## Troubleshooting Común

### Composer autoload no funciona

```bash
composer dump-autoload
```

### Puerto 8080 ocupado

```bash
# Cambiar puerto
php -S localhost:8081

# O matar proceso
lsof -ti:8080 | xargs kill
```

### Frontend no conecta con API

Verificar proxy en `vite.config.ts`:

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8080',
      changeOrigin: true
    }
  }
}
```

### Database locked

```bash
# Cerrar conexiones
pkill -9 php

# Eliminar locks
rm panel/backend/storage/database/*.db-shm
rm panel/backend/storage/database/*.db-wal
```

## Recursos

- [PHP Documentation](https://www.php.net/docs.php)
- [Vue 3 Documentation](https://vuejs.org/)
- [PrimeVue Documentation](https://primevue.org/)
- [Docker Documentation](https://docs.docker.com/)
- [Supabase Documentation](https://supabase.com/docs)

## Contribuir

1. Fork el proyecto
2. Crear branch de feature
3. Commit cambios
4. Push a branch
5. Crear Pull Request

## Licencia

MIT License

---

Happy coding! 🚀
