# TM Cloud - Deployment Guide

Guía completa de despliegue en producción.

## 🎯 Requisitos de Servidor

### Especificaciones Mínimas

| Componente | Mínimo | Recomendado | Óptimo |
|------------|--------|-------------|--------|
| RAM | 4 GB | 8 GB | 16 GB+ |
| CPU | 2 cores | 4 cores | 8 cores+ |
| Disco | 50 GB SSD | 100 GB SSD | 200 GB+ SSD |
| Ancho de banda | 1 TB/mes | 2 TB/mes | Ilimitado |
| Sistema Operativo | Ubuntu 20.04 | Ubuntu 22.04 | Ubuntu 24.04 |

### Proveedores Recomendados

| Proveedor | Plan | Precio/mes | Proyectos |
|-----------|------|------------|-----------|
| **Hetzner** | CPX21 (8GB) | €8 (~$9) | ~20 |
| **Hetzner** | CPX31 (16GB) | €16 (~$18) | ~50 |
| **DigitalOcean** | Basic 8GB | $48 | ~20 |
| **Linode** | Linode 8GB | $36 | ~20 |
| **Vultr** | Cloud 8GB | $48 | ~20 |

💡 **Recomendación**: Hetzner ofrece la mejor relación precio/rendimiento.

## 📋 Instalación Paso a Paso

### Paso 1: Preparar el Servidor

```bash
# Conectar por SSH
ssh root@your-server-ip

# Actualizar sistema
apt update && apt upgrade -y
```

### Paso 2: Instalar Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl enable docker
systemctl start docker
```

### Paso 3: Instalar Dependencias

```bash
# PHP 8.3
add-apt-repository ppa:ondrej/php -y
apt update
apt install -y php8.3 php8.3-fpm php8.3-cli php8.3-sqlite3 php8.3-curl php8.3-mbstring php8.3-xml

# Composer
curl -sS https://getcomposer.org/installer | php
mv composer.phar /usr/local/bin/composer

# Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Nginx
apt install -y nginx

# Certbot
apt install -y certbot python3-certbot-nginx
```

### Paso 4: Clonar TM Cloud

```bash
cd /var
git clone <repository-url> tm-cloud
cd tm-cloud
```

### Paso 5: Ejecutar Instalador

```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

### Paso 6: Configurar SSL

```bash
certbot --nginx -d panel.yourdomain.com
```

## ✅ Verificación

```bash
# Verificar servicios
systemctl status nginx
systemctl status php8.3-fpm

# Probar API
curl http://localhost:8080/api/health

# Acceder al panel
# http://your-server-ip o https://panel.yourdomain.com
```

---

**¡Listo!** Tu instancia de TM Cloud está funcionando.
