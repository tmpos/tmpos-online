# Cliente API de Hostinger

Módulo JavaScript para interactuar con la API de Hostinger desde tu aplicación.

## 🔗 Recursos

- [Documentación oficial de Hostinger API](https://developers.hostinger.com/)
- [Tutorial de MCP server](https://www.hostinger.com/tutorials/how-to-run-hostinger-api-mcp-server)
- [Guía de SDKs](https://www.hostinger.com/support/11080244-introduction-to-hostinger-api-sdks/)
- [Colección de Postman](https://www.postman.com/hostinger-api/hostinger/collection/1jnj25h/hostinger-api)
- [GitHub - MCP Server](https://github.com/hostinger/api-mcp-server)
- [GitHub - API](https://github.com/hostinger/api)

## 📦 Instalación

Los archivos ya están creados:

**Configuración:**
- `.env` - Variables de entorno (contiene el token)
- `.env.example` - Plantilla de configuración
- `src/config/hostinger.ts` - Archivo de configuración

**Cliente API:**
- `src/services/hostingerApi.js` - Cliente principal de la API
- `src/services/hostingerExample.js` - Ejemplos de uso
- `testHostinger.js` - Script de prueba Node.js

### Configuración inicial

El token ya está configurado en `.env`. Si necesitas cambiarlo:

```bash
# Edita .env y actualiza:
VITE_HOSTINGER_API_TOKEN=tu_nuevo_token
VITE_HOSTINGER_VPS_ID=1794803
VITE_HOSTINGER_DOMAIN=elsistema.tech
```

## 🚀 Uso Básico

### Importar el módulo

```javascript
import { hostingerApi } from './services/hostingerApi.js';
```

### Ejemplos rápidos

#### Listar VPS
```javascript
const vps = await hostingerApi.getVirtualMachines();
console.log('Mis VPS:', vps);
```

#### Obtener dominios
```javascript
const dominios = await hostingerApi.getDomains();
console.log('Mis dominios:', dominios);
```

#### Ver subscripciones
```javascript
const subs = await hostingerApi.getSubscriptions();
console.log('Mis subscripciones:', subs);
```

## 📊 Tu Cuenta Actual

### VPS
- **ID**: 1794803
- **Hostname**: srv1794803.hstgr.cloud
- **Plan**: KVM 4
- **Estado**: running
- **Recursos**:
  - 4 CPUs
  - 16 GB RAM
  - 200 GB Disco
  - 16 TB Ancho de banda
- **IPs**:
  - IPv4: 2.25.196.95
  - IPv6: 2a02:4780:75:8fcb::1
- **Sistema**: Ubuntu 24.04 with Supabase

### Dominios
- **elsistema.tech**
  - Estado: activo
  - Expira: 30 de junio 2027

### Subscripciones
1. **KVM 4 VPS**: $371.88/año
   - Próxima renovación: 16 de junio 2027
   - Auto-renovación: ✓

2. **.TECH Domain**: $64.19/año
   - Próxima renovación: 3 de junio 2027
   - Auto-renovación: ✓

## 🛠️ API Disponibles

### VPS Management

```javascript
// Listar todos los VPS
const vps = await hostingerApi.getVirtualMachines();

// Obtener detalles de un VPS
const detalle = await hostingerApi.getVirtualMachine(1794803);

// Obtener métricas de rendimiento
const metricas = await hostingerApi.getVPSMetrics(1794803, '24h');
// Periodos disponibles: '1h', '24h', '7d', '30d'

// Control del VPS
await hostingerApi.restartVPS(1794803);   // Reiniciar
await hostingerApi.shutdownVPS(1794803);  // Apagar
await hostingerApi.startVPS(1794803);     // Encender
```

### Domain Management

```javascript
// Listar dominios
const dominios = await hostingerApi.getDomains();

// Obtener info de un dominio
const info = await hostingerApi.getDomain('elsistema.tech');

// Verificar disponibilidad
const disponible = await hostingerApi.checkDomainAvailability('midominio.com');
```

### DNS Management

```javascript
// Obtener registros DNS
const registros = await hostingerApi.getDNSRecords('elsistema.tech');

// Actualizar registros DNS
const nuevosRegistros = [
  {
    type: 'A',
    name: '@',
    content: '1.2.3.4',
    ttl: 3600
  },
  {
    type: 'CNAME',
    name: 'www',
    content: 'elsistema.tech',
    ttl: 3600
  }
];
await hostingerApi.updateDNSRecords('elsistema.tech', nuevosRegistros);

// Crear snapshot de DNS (backup)
await hostingerApi.createDNSSnapshot('elsistema.tech', 'Backup 2026-07-01');

// Listar snapshots
const snapshots = await hostingerApi.getDNSSnapshots('elsistema.tech');
```

### Billing

```javascript
// Listar subscripciones
const subs = await hostingerApi.getSubscriptions();

// Listar métodos de pago
const metodos = await hostingerApi.getPaymentMethods();

// Gestionar auto-renovación
await hostingerApi.enableAutoRenewal('subId');
await hostingerApi.disableAutoRenewal('subId');

// Ver catálogo de productos
const catalogo = await hostingerApi.getCatalog();
```

## 🎯 Ejemplo Completo: Dashboard

```javascript
import { crearDashboard } from './services/hostingerExample.js';

// Genera un dashboard con toda la información de tu cuenta
await crearDashboard();
```

Salida:
```
╔══════════════════════════════════════╗
║   Dashboard Hostinger - elsistema.tech   ║
╚══════════════════════════════════════╝

📊 VPS:
  • srv1794803.hstgr.cloud
    Estado: running
    Plan: KVM 4
    CPU: 4 cores | RAM: 16384MB | Disco: 204800MB
    IPv4: 2.25.196.95
    IPv6: 2a02:4780:75:8fcb::1

🌐 Dominios:
  • elsistema.tech (domain)
    Estado: active
    Expira: 30/6/2027

💳 Subscripciones:
  • KVM 4
    Precio: $371.88 USD / 1 year
    Auto-renovación: ✓
    Próximo pago: 16/6/2027
```

## 🔐 Seguridad

✅ **Configuración segura implementada:**

1. **Token en variables de entorno**: El token está guardado en `.env` (no en el código)
2. **Archivo `.env` en `.gitignore`**: Ya configurado, no se subirá a git
3. **Archivo `.env.example`**: Plantilla sin datos sensibles para el repositorio
4. **Configuración centralizada**: Todo se maneja desde `src/config/hostinger.ts`

**Advertencias:**
- ⚠️ Nunca compartas tu archivo `.env`
- ⚠️ Nunca hagas commit del archivo `.env`
- ⚠️ El token tiene los mismos permisos que tu usuario de Hostinger
- ⚠️ Puedes configurar una fecha de expiración para el token en el panel de Hostinger

## 📝 Rate Limiting

La API tiene límites de velocidad:
- Si excedes el límite, recibirás un error `429 Too Many Requests`
- Tu IP puede ser bloqueada temporalmente si excedes los límites varias veces
- Los headers de respuesta incluyen información sobre los límites

## 🧪 Testing

Para probar la conexión:

```bash
# Usando Node.js
node src/services/hostingerExample.js
```

## 📚 Documentación Adicional

Para ver todos los endpoints disponibles:
```bash
curl -s https://developers.hostinger.com/openapi/openapi.json | jq '.paths | keys'
```

## 🆘 Soporte

- [Issues en GitHub](https://github.com/hostinger/api/issues)
- [Discussions en GitHub](https://github.com/hostinger/api/discussions)
- Email: devs@hostinger.com

## 📄 Licencia

Este código es de ejemplo para uso con la API de Hostinger. Consulta los términos de servicio de Hostinger para el uso de su API.
