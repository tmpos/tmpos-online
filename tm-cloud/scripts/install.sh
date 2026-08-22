#!/bin/bash

set -e

echo "==================================="
echo "TM Cloud - Installation Script"
echo "==================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

# Check requirements
echo "Checking requirements..."

# Check Docker
if ! command -v docker &> /dev/null; then
  echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker found${NC}"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
  echo -e "${RED}Docker Compose is not installed. Please install Docker Compose first.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker Compose found${NC}"

# Check PHP
if ! command -v php &> /dev/null; then
  echo -e "${RED}PHP is not installed. Please install PHP 8.3 or higher.${NC}"
  exit 1
fi
PHP_VERSION=$(php -r 'echo PHP_VERSION;')
echo -e "${GREEN}✓ PHP $PHP_VERSION found${NC}"

# Check Composer
if ! command -v composer &> /dev/null; then
  echo -e "${YELLOW}⚠ Composer not found. Installing...${NC}"
  curl -sS https://getcomposer.org/installer | php
  mv composer.phar /usr/local/bin/composer
  chmod +x /usr/local/bin/composer
fi
echo -e "${GREEN}✓ Composer found${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}Node.js is not installed. Please install Node.js 18 or higher.${NC}"
  exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js $NODE_VERSION found${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
  echo -e "${RED}npm is not installed.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ npm found${NC}"

echo ""
echo "==================================="
echo "Installing TM Cloud..."
echo "==================================="
echo ""

# Set installation directory
INSTALL_DIR="/var/tm-cloud"

# Create directory structure
echo "Creating directory structure..."
mkdir -p $INSTALL_DIR/{panel/{backend,frontend},projects,backups,nginx,scripts}

# Copy files
echo "Copying files..."
cp -r panel/* $INSTALL_DIR/panel/
cp -r scripts/* $INSTALL_DIR/scripts/

# Install backend dependencies
echo "Installing backend dependencies..."
cd $INSTALL_DIR/panel/backend
composer install --no-dev --optimize-autoloader

# Initialize database
echo "Initializing database..."
composer migrate

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd $INSTALL_DIR/panel/frontend
npm install

# Build frontend
echo "Building frontend..."
npm run build

# Set permissions
echo "Setting permissions..."
chown -R www-data:www-data $INSTALL_DIR
chmod -R 755 $INSTALL_DIR

# Configure Nginx (if installed)
if command -v nginx &> /dev/null; then
  echo "Configuring Nginx..."

  cat > /etc/nginx/sites-available/tm-cloud-api <<EOF
server {
    listen 8080;
    server_name _;

    root $INSTALL_DIR/panel/backend/public;
    index index.php;

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        include fastcgi_params;
    }
}
EOF

  cat > /etc/nginx/sites-available/tm-cloud-panel <<EOF
server {
    listen 80;
    server_name _;

    root $INSTALL_DIR/panel/frontend/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

  ln -sf /etc/nginx/sites-available/tm-cloud-api /etc/nginx/sites-enabled/
  ln -sf /etc/nginx/sites-available/tm-cloud-panel /etc/nginx/sites-enabled/

  nginx -t && systemctl reload nginx

  echo -e "${GREEN}✓ Nginx configured${NC}"
fi

echo ""
echo "==================================="
echo -e "${GREEN}Installation Complete!${NC}"
echo "==================================="
echo ""
echo "TM Cloud has been installed successfully."
echo ""
echo "Next steps:"
echo "1. Configure your domain DNS to point to this server"
echo "2. Access the panel at: http://your-server-ip"
echo "3. API is available at: http://your-server-ip/api"
echo ""
echo "For SSL, run: certbot --nginx"
echo ""
