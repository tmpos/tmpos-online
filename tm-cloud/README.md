# TM Cloud - Supabase PaaS Platform

TM Cloud is a Platform-as-a-Service (PaaS) solution for managing multiple self-hosted Supabase instances within a single VPS. Similar to how Vercel manages applications or Railway manages databases, TM Cloud automates the complete lifecycle of Supabase instances.

## Features

- **Multi-Project Management**: Create and manage multiple isolated Supabase instances
- **Automated Setup**: One-click deployment with automatic Docker, Nginx, and SSL configuration
- **Complete Isolation**: Each project has independent databases, storage, and authentication
- **Resource Monitoring**: Real-time metrics for CPU, memory, and disk usage
- **Automated Backups**: Scheduled backups with one-click restore
- **Modern UI**: Beautiful Vue 3 dashboard with PrimeVue components
- **API First**: RESTful API for automation and integration

## Architecture

```
TM Cloud
├── Panel (Management Interface)
│   ├── Backend (PHP 8.3 API)
│   └── Frontend (Vue 3 + PrimeVue)
├── Projects (Supabase Instances)
│   ├── PostgreSQL Database
│   ├── Supabase Studio
│   ├── Auth (GoTrue)
│   ├── Storage
│   ├── Realtime
│   └── PostgREST
├── Backups (Automated & Manual)
└── Nginx (Reverse Proxy + SSL)
```

## Requirements

- **OS**: Ubuntu 20.04 or higher / Debian 11 or higher
- **Docker**: >= 20.0
- **Docker Compose**: >= 2.0
- **PHP**: >= 8.3
- **Node.js**: >= 18.0
- **Nginx**: Latest stable
- **RAM**: Minimum 4GB (8GB+ recommended)
- **Disk**: Minimum 50GB SSD
- **CPU**: 2+ cores

## Installation

### Quick Install

```bash
# Download the installer
wget https://raw.githubusercontent.com/your-repo/tm-cloud/main/scripts/install.sh

# Make it executable
chmod +x install.sh

# Run as root
sudo ./install.sh
```

### Manual Installation

1. **Clone the repository**

```bash
git clone https://github.com/your-repo/tm-cloud.git
cd tm-cloud
```

2. **Install backend dependencies**

```bash
cd panel/backend
composer install
composer migrate
```

3. **Install frontend dependencies**

```bash
cd ../frontend
npm install
npm run build
```

4. **Configure Nginx**

```bash
# Copy configuration files
sudo cp nginx/tm-cloud-api.conf /etc/nginx/sites-available/
sudo cp nginx/tm-cloud-panel.conf /etc/nginx/sites-available/

# Enable sites
sudo ln -s /etc/nginx/sites-available/tm-cloud-api.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/tm-cloud-panel.conf /etc/nginx/sites-enabled/

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

5. **Set permissions**

```bash
sudo chown -R www-data:www-data /var/tm-cloud
sudo chmod -R 755 /var/tm-cloud
```

## Usage

### Creating a Project

1. Access the panel at `http://your-server-ip`
2. Click "New Project"
3. Fill in the project details:
   - Project Name
   - Slug (URL-friendly identifier)
   - Domain
   - PostgreSQL version
   - Resource limits
   - Client information

4. Click "Create Project"

The system will:
- Generate secure credentials
- Allocate unique ports
- Create Docker containers
- Configure Nginx reverse proxy
- Generate SSL certificates (if domain is configured)
- Start all services

### Managing Projects

**Restart Project**
```bash
# Via API
curl -X POST http://your-server/api/projects/{id}/restart

# Via UI
Dashboard > Projects > Restart button
```

**Suspend Project**
```bash
# Via API
curl -X POST http://your-server/api/projects/{id}/suspend
```

**Activate Project**
```bash
# Via API
curl -X POST http://your-server/api/projects/{id}/activate
```

**Delete Project**
```bash
# Via API
curl -X DELETE http://your-server/api/projects/{id}
```

### Backups

**Create Manual Backup**
```bash
curl -X POST http://your-server/api/backups \
  -H "Content-Type: application/json" \
  -d '{"project_id": 1, "type": "manual"}'
```

**Restore Backup**
```bash
curl -X POST http://your-server/api/backups/{id}/restore
```

**Schedule Automatic Backups**
```bash
curl -X POST http://your-server/api/backups/schedule \
  -H "Content-Type: application/json" \
  -d '{"project_id": 1, "schedule": "daily"}'
```

## API Documentation

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/{id}` | Get project details |
| POST | `/api/projects` | Create new project |
| PUT | `/api/projects/{id}` | Update project |
| DELETE | `/api/projects/{id}` | Delete project |
| POST | `/api/projects/{id}/restart` | Restart project |
| POST | `/api/projects/{id}/suspend` | Suspend project |
| POST | `/api/projects/{id}/activate` | Activate project |
| GET | `/api/projects/{id}/logs` | Get project logs |
| GET | `/api/projects/{id}/stats` | Get project stats |

### Backups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/backups` | List all backups |
| GET | `/api/backups/{id}` | Get backup details |
| POST | `/api/backups` | Create backup |
| POST | `/api/backups/{id}/restore` | Restore backup |
| DELETE | `/api/backups/{id}` | Delete backup |

## Configuration

### Database

Configuration file: `panel/backend/config/database.php`

```php
return [
    'driver' => 'sqlite',
    'path' => __DIR__ . '/../storage/database/tm-cloud.db',
    'foreign_keys' => true
];
```

### Docker Ports

Configuration file: `panel/backend/config/docker.php`

```php
return [
    'ports' => [
        'range_start' => 8000,
        'range_end' => 9000
    ]
];
```

### CORS

Configuration file: `panel/backend/config/app.php`

```php
return [
    'cors' => [
        'allowed_origins' => [
            'http://localhost:3000',
            'https://your-domain.com'
        ]
    ]
];
```

## Security

- All projects are completely isolated with separate Docker networks
- Unique credentials generated for each project using cryptographically secure random bytes
- JWT secrets are 256-bit random keys
- PostgreSQL passwords are 128-bit random keys
- Nginx reverse proxy with SSL/TLS support
- Foreign key constraints in SQLite for data integrity

## Monitoring

TM Cloud collects and stores:
- CPU usage per project
- Memory usage per project
- Disk usage per project
- Container status and health
- Request counts
- Error counts

Access monitoring data via:
- Dashboard UI
- `/api/monitoring/system` endpoint
- `/api/monitoring/project/{id}` endpoint

## Troubleshooting

### Projects won't start

```bash
# Check Docker status
docker ps -a

# Check project logs
docker-compose -f /var/tm-cloud/projects/{slug}/docker-compose.yml logs

# Restart Docker
sudo systemctl restart docker
```

### API not responding

```bash
# Check PHP-FPM
sudo systemctl status php8.3-fpm

# Check Nginx
sudo systemctl status nginx
sudo nginx -t

# Check API logs
tail -f /var/tm-cloud/panel/backend/storage/logs/*.log
```

### Database issues

```bash
# Check database file
ls -la /var/tm-cloud/panel/backend/storage/database/

# Re-run migrations
cd /var/tm-cloud/panel/backend
composer migrate
```

## Development

### Backend Development

```bash
cd panel/backend

# Install dependencies
composer install

# Run migrations
composer migrate

# Start built-in server
php -S localhost:8080 -t public
```

### Frontend Development

```bash
cd panel/frontend

# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- Documentation: https://docs.tmcloud.com
- Issues: https://github.com/your-repo/tm-cloud/issues
- Email: support@tmcloud.com

## Roadmap

### Version 1.1
- [ ] User authentication and RBAC
- [ ] Email notifications
- [ ] Webhook support
- [ ] Advanced monitoring with Grafana

### Version 1.2
- [ ] Multi-VPS support
- [ ] Load balancing
- [ ] Auto-scaling
- [ ] CDN integration

### Version 2.0
- [ ] Kubernetes support
- [ ] Multi-region deployment
- [ ] High availability
- [ ] Disaster recovery

## Credits

Built with:
- [Supabase](https://supabase.com)
- [Vue 3](https://vuejs.org)
- [PrimeVue](https://primevue.org)
- [Docker](https://docker.com)
- [PHP](https://php.net)

---

Made with ❤️ for the self-hosting community
