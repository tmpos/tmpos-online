# TM Cloud - Quick Start Guide

Get TM Cloud up and running in under 10 minutes!

## Prerequisites

You'll need a fresh Ubuntu/Debian VPS with:
- At least 4GB RAM
- 50GB disk space
- Root access

## Installation (5 minutes)

### Step 1: Update your system

```bash
sudo apt update && sudo apt upgrade -y
```

### Step 2: Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

### Step 3: Install PHP 8.3

```bash
# Add PHP repository
sudo add-apt-repository ppa:ondrej/php -y
sudo apt update

# Install PHP and extensions
sudo apt install -y php8.3 php8.3-fpm php8.3-cli php8.3-sqlite3 php8.3-curl php8.3-mbstring php8.3-xml

# Verify installation
php -v
```

### Step 4: Install Node.js 18+

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node -v
npm -v
```

### Step 5: Install Nginx

```bash
sudo apt install -y nginx

# Verify installation
nginx -v
```

### Step 6: Install TM Cloud

```bash
# Clone repository
cd /var
sudo git clone https://github.com/your-repo/tm-cloud.git
cd tm-cloud

# Run installer
sudo bash scripts/install.sh
```

## Initial Configuration (2 minutes)

### Configure Firewall

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8000:9000/tcp  # Port range for Supabase instances

# Enable firewall
sudo ufw enable
```

### Point your domain to the server

Update your DNS records:

```
A    panel.yourdomain.com    -> YOUR_SERVER_IP
A    *.yourdomain.com        -> YOUR_SERVER_IP
```

### Setup SSL (Optional but recommended)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d panel.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

## Create Your First Project (2 minutes)

### Via Web Interface

1. Open your browser and go to `http://YOUR_SERVER_IP` or `https://panel.yourdomain.com`

2. Click "New Project"

3. Fill in the details:
   ```
   Project Name: My First Project
   Slug: my-first-project
   Domain: project1.yourdomain.com
   PostgreSQL Version: 15
   Max Connections: 100
   ```

4. Click "Create Project"

5. Wait 1-2 minutes for deployment

6. Access your Supabase instance:
   - Studio: `https://project1.yourdomain.com/studio`
   - API: `https://project1.yourdomain.com`

### Via API

```bash
curl -X POST http://YOUR_SERVER_IP/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First Project",
    "slug": "my-first-project",
    "domain": "project1.yourdomain.com",
    "postgres_version": "15",
    "max_connections": 100,
    "client_name": "John Doe",
    "client_email": "john@example.com"
  }'
```

## What's Next?

### Explore the Dashboard

- View all projects
- Monitor resource usage
- Create manual backups
- View logs

### Set up Automated Backups

```bash
# Daily backups
curl -X POST http://YOUR_SERVER_IP/api/backups/schedule \
  -H "Content-Type: application/json" \
  -d '{"project_id": 1, "schedule": "daily"}'
```

### Monitor Your Projects

```bash
# Get project stats
curl http://YOUR_SERVER_IP/api/projects/1/stats

# Get project logs
curl http://YOUR_SERVER_IP/api/projects/1/logs?service=db&lines=100
```

### Customize Configuration

Edit the configuration files:

```bash
# Backend config
sudo nano /var/tm-cloud/panel/backend/config/app.php

# Docker config
sudo nano /var/tm-cloud/panel/backend/config/docker.php
```

## Troubleshooting

### Project won't start?

```bash
# Check Docker
sudo docker ps -a

# Check project logs
cd /var/tm-cloud/projects/my-first-project
sudo docker-compose logs
```

### Can't access the panel?

```bash
# Check Nginx
sudo systemctl status nginx
sudo nginx -t

# Check PHP-FPM
sudo systemctl status php8.3-fpm
```

### API not responding?

```bash
# Check API logs
sudo tail -f /var/tm-cloud/panel/backend/storage/logs/*.log

# Restart services
sudo systemctl restart nginx
sudo systemctl restart php8.3-fpm
```

## Useful Commands

```bash
# List all projects
php /var/tm-cloud/scripts/list-projects.php

# Run migrations
php /var/tm-cloud/scripts/migrate.php

# Check system resources
htop

# View Docker containers
docker ps

# Check Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

## Support

- Documentation: Full README.md
- Issues: GitHub Issues
- Community: Discord/Slack

## Next Steps

1. ✅ Install TM Cloud
2. ✅ Create your first project
3. 📚 Read the full documentation
4. 🔐 Set up backups
5. 📊 Configure monitoring
6. 🚀 Scale to multiple projects

---

**Congratulations!** You now have a fully functional Supabase PaaS platform. Start creating projects and enjoy self-hosted Supabase at scale!
