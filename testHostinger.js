/**
 * Script de prueba para la API de Hostinger
 * Ejecutar con: node testHostinger.js
 *
 * Nota: Este script usa dotenv para cargar el token desde .env
 */

require('dotenv').config();
const https = require('https');

const API_TOKEN = process.env.VITE_HOSTINGER_API_TOKEN;
const BASE_URL = 'developers.hostinger.com';

if (!API_TOKEN) {
  console.error('❌ Error: VITE_HOSTINGER_API_TOKEN no está configurado en .env');
  console.error('Por favor, crea un archivo .env con tu token de Hostinger.');
  process.exit(1);
}

// Función auxiliar para hacer peticiones HTTPS
function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Error parsing JSON: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Función para formatear fechas
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Función para formatear precios
function formatPrice(cents, currency) {
  return `$${(cents / 100).toFixed(2)} ${currency}`;
}

// Dashboard principal
async function crearDashboard() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║   Dashboard Hostinger - elsistema.tech             ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    // 1. INFORMACIÓN DE VPS
    console.log('📊 SERVIDORES VPS');
    console.log('─'.repeat(50));
    const vps = await makeRequest('/api/vps/v1/virtual-machines');

    if (Array.isArray(vps) && vps.length > 0) {
      vps.forEach((vm, index) => {
        console.log(`\n${index + 1}. ${vm.hostname}`);
        console.log(`   ID: ${vm.id}`);
        console.log(`   Estado: ${vm.state === 'running' ? '✓' : '✗'} ${vm.state.toUpperCase()}`);
        console.log(`   Plan: ${vm.plan}`);
        console.log(`   Recursos:`);
        console.log(`     • CPU: ${vm.cpus} cores`);
        console.log(`     • RAM: ${(vm.memory / 1024).toFixed(1)} GB`);
        console.log(`     • Disco: ${(vm.disk / 1024).toFixed(1)} GB`);
        console.log(`     • Ancho de banda: ${(vm.bandwidth / 1024 / 1024).toFixed(1)} TB`);
        console.log(`   Centro de datos: #${vm.data_center_id}`);
        console.log(`   IPs:`);
        if (vm.ipv4 && vm.ipv4.length > 0) {
          console.log(`     • IPv4: ${vm.ipv4[0].address}`);
        }
        if (vm.ipv6 && vm.ipv6.length > 0) {
          console.log(`     • IPv6: ${vm.ipv6[0].address}`);
        }
        console.log(`   DNS:`);
        console.log(`     • NS1: ${vm.ns1}`);
        console.log(`     • NS2: ${vm.ns2}`);
        if (vm.template) {
          console.log(`   Sistema: ${vm.template.name}`);
        }
        console.log(`   Creado: ${formatDate(vm.created_at)}`);
      });
    } else {
      console.log('   No se encontraron VPS');
    }

    // 2. DOMINIOS
    console.log('\n\n🌐 DOMINIOS');
    console.log('─'.repeat(50));
    const dominios = await makeRequest('/api/domains/v1/portfolio');

    if (Array.isArray(dominios) && dominios.length > 0) {
      // Agrupar por dominio único
      const dominiosUnicos = {};
      dominios.forEach(dom => {
        if (!dominiosUnicos[dom.domain]) {
          dominiosUnicos[dom.domain] = [];
        }
        dominiosUnicos[dom.domain].push(dom);
      });

      Object.entries(dominiosUnicos).forEach(([nombre, registros], index) => {
        console.log(`\n${index + 1}. ${nombre}`);
        registros.forEach(reg => {
          console.log(`   • Tipo: ${reg.type}`);
          console.log(`     Estado: ${reg.status === 'active' ? '✓' : '✗'} ${reg.status.toUpperCase()}`);
          if (reg.expires_at) {
            console.log(`     Expira: ${formatDate(reg.expires_at)}`);
          }
          console.log(`     Creado: ${formatDate(reg.created_at)}`);
        });
      });
    } else {
      console.log('   No se encontraron dominios');
    }

    // 3. SUBSCRIPCIONES Y BILLING
    console.log('\n\n💳 SUBSCRIPCIONES Y FACTURACIÓN');
    console.log('─'.repeat(50));
    const subs = await makeRequest('/api/billing/v1/subscriptions');

    if (Array.isArray(subs) && subs.length > 0) {
      let totalAnual = 0;
      subs.forEach((sub, index) => {
        console.log(`\n${index + 1}. ${sub.name}`);
        console.log(`   ID: ${sub.id}`);
        console.log(`   Estado: ${sub.status === 'active' ? '✓' : '✗'} ${sub.status.toUpperCase()}`);
        console.log(`   Precio: ${formatPrice(sub.total_price, sub.currency_code)} / ${sub.billing_period} ${sub.billing_period_unit}`);
        console.log(`   Renovación: ${formatPrice(sub.renewal_price, sub.currency_code)}`);
        console.log(`   Auto-renovación: ${sub.is_auto_renewed ? '✓ Activa' : '✗ Inactiva'}`);
        console.log(`   Creado: ${formatDate(sub.created_at)}`);
        console.log(`   Próximo pago: ${formatDate(sub.next_billing_at)}`);

        // Calcular total anual
        if (sub.billing_period_unit === 'year') {
          totalAnual += sub.total_price;
        } else if (sub.billing_period_unit === 'month') {
          totalAnual += sub.total_price * 12;
        }
      });

      console.log('\n' + '─'.repeat(50));
      console.log(`📈 Costo total anual estimado: ${formatPrice(totalAnual, subs[0].currency_code)}`);
    } else {
      console.log('   No se encontraron subscripciones');
    }

    // 4. RESUMEN
    console.log('\n\n✅ RESUMEN');
    console.log('─'.repeat(50));
    console.log(`• Servidores VPS activos: ${Array.isArray(vps) ? vps.length : 0}`);
    console.log(`• Dominios registrados: ${Array.isArray(dominios) ? new Set(dominios.map(d => d.domain)).size : 0}`);
    console.log(`• Subscripciones activas: ${Array.isArray(subs) ? subs.length : 0}`);

    console.log('\n✨ Dashboard generado exitosamente\n');

  } catch (error) {
    console.error('\n❌ Error al generar el dashboard:', error.message);
    console.error('Detalles:', error);
  }
}

// Función para pruebas individuales
async function pruebasIndividuales() {
  console.log('\n🧪 Ejecutando pruebas individuales...\n');

  const pruebas = [
    {
      nombre: 'VPS',
      endpoint: '/api/vps/v1/virtual-machines'
    },
    {
      nombre: 'Dominios',
      endpoint: '/api/domains/v1/portfolio'
    },
    {
      nombre: 'Subscripciones',
      endpoint: '/api/billing/v1/subscriptions'
    }
  ];

  for (const prueba of pruebas) {
    try {
      console.log(`Testing ${prueba.nombre}...`);
      const resultado = await makeRequest(prueba.endpoint);
      console.log(`✓ ${prueba.nombre}: OK (${Array.isArray(resultado) ? resultado.length : 1} items)`);
    } catch (error) {
      console.log(`✗ ${prueba.nombre}: ERROR - ${error.message}`);
    }
  }
}

// Ejecutar dashboard
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    await pruebasIndividuales();
  } else {
    await crearDashboard();
  }
}

// Ejecutar
main().catch(console.error);
