/**
 * Ejemplos de uso del cliente de API de Hostinger
 */

import { hostingerApi } from './hostingerApi.js';

// ============================================
// EJEMPLOS DE USO
// ============================================

async function ejemplosVPS() {
  console.log('=== Ejemplos VPS ===\n');

  try {
    // Listar todos los VPS
    const vps = await hostingerApi.getVirtualMachines();
    console.log('Servidores VPS:', vps);

    if (vps.length > 0) {
      const vmId = vps[0].id;

      // Obtener detalles de un VPS específico
      const detalle = await hostingerApi.getVirtualMachine(vmId);
      console.log('\nDetalle del VPS:', detalle);

      // Obtener métricas de rendimiento
      const metricas = await hostingerApi.getVPSMetrics(vmId, '24h');
      console.log('\nMétricas (últimas 24h):', metricas);

      // Ejemplos de control (¡Cuidado! Estos comandos controlan el servidor real)
      // await hostingerApi.restartVPS(vmId);  // Reiniciar
      // await hostingerApi.shutdownVPS(vmId); // Apagar
      // await hostingerApi.startVPS(vmId);    // Encender
    }
  } catch (error) {
    console.error('Error en ejemplos VPS:', error);
  }
}

async function ejemplosDominios() {
  console.log('\n=== Ejemplos Dominios ===\n');

  try {
    // Listar todos los dominios
    const dominios = await hostingerApi.getDomains();
    console.log('Dominios:', dominios);

    if (dominios.length > 0) {
      const dominio = dominios[0].domain;

      // Obtener información de un dominio específico
      const info = await hostingerApi.getDomain(dominio);
      console.log(`\nInformación de ${dominio}:`, info);

      // Obtener registros DNS
      const dns = await hostingerApi.getDNSRecords(dominio);
      console.log(`\nRegistros DNS de ${dominio}:`, dns);
    }

    // Verificar disponibilidad de un dominio
    const disponibilidad = await hostingerApi.checkDomainAvailability('midominio-ejemplo.com');
    console.log('\nDisponibilidad:', disponibilidad);
  } catch (error) {
    console.error('Error en ejemplos dominios:', error);
  }
}

async function ejemplosDNS() {
  console.log('\n=== Ejemplos DNS ===\n');

  try {
    const dominio = 'elsistema.tech';

    // Listar registros DNS actuales
    const registros = await hostingerApi.getDNSRecords(dominio);
    console.log('Registros DNS actuales:', registros);

    // Crear un snapshot antes de modificar
    await hostingerApi.createDNSSnapshot(dominio, 'Backup antes de cambios');

    // Listar snapshots
    const snapshots = await hostingerApi.getDNSSnapshots(dominio);
    console.log('Snapshots disponibles:', snapshots);

    // Ejemplo de actualización de registros DNS (comentado por seguridad)
    /*
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
    await hostingerApi.updateDNSRecords(dominio, nuevosRegistros);
    */
  } catch (error) {
    console.error('Error en ejemplos DNS:', error);
  }
}

async function ejemplosBilling() {
  console.log('\n=== Ejemplos Billing ===\n');

  try {
    // Listar subscripciones
    const subs = await hostingerApi.getSubscriptions();
    console.log('Subscripciones:', subs);

    // Listar métodos de pago
    const metodos = await hostingerApi.getPaymentMethods();
    console.log('\nMétodos de pago:', metodos);

    // Obtener catálogo de productos
    const catalogo = await hostingerApi.getCatalog();
    console.log('\nCatálogo de productos:', catalogo);

    // Ejemplo de gestión de auto-renovación
    /*
    if (subs.length > 0) {
      const subId = subs[0].id;
      await hostingerApi.disableAutoRenewal(subId);  // Deshabilitar
      await hostingerApi.enableAutoRenewal(subId);   // Habilitar
    }
    */
  } catch (error) {
    console.error('Error en ejemplos billing:', error);
  }
}

// ============================================
// EJEMPLO PRÁCTICO: Dashboard de estado
// ============================================

async function crearDashboard() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   Dashboard Hostinger - elsistema.tech   ║');
  console.log('╚══════════════════════════════════════╝\n');

  try {
    // Obtener información de VPS
    const vps = await hostingerApi.getVirtualMachines();
    console.log('📊 VPS:');
    vps.forEach(vm => {
      console.log(`  • ${vm.hostname}`);
      console.log(`    Estado: ${vm.state}`);
      console.log(`    Plan: ${vm.plan}`);
      console.log(`    CPU: ${vm.cpus} cores | RAM: ${vm.memory}MB | Disco: ${vm.disk}MB`);
      console.log(`    IPv4: ${vm.ipv4[0]?.address || 'N/A'}`);
      console.log(`    IPv6: ${vm.ipv6[0]?.address || 'N/A'}`);
    });

    // Obtener dominios
    const dominios = await hostingerApi.getDomains();
    console.log('\n🌐 Dominios:');
    dominios.forEach(dom => {
      console.log(`  • ${dom.domain} (${dom.type})`);
      console.log(`    Estado: ${dom.status}`);
      if (dom.expires_at) {
        console.log(`    Expira: ${new Date(dom.expires_at).toLocaleDateString()}`);
      }
    });

    // Obtener subscripciones
    const subs = await hostingerApi.getSubscriptions();
    console.log('\n💳 Subscripciones:');
    subs.forEach(sub => {
      const precio = (sub.total_price / 100).toFixed(2);
      console.log(`  • ${sub.name}`);
      console.log(`    Precio: $${precio} ${sub.currency_code} / ${sub.billing_period} ${sub.billing_period_unit}`);
      console.log(`    Auto-renovación: ${sub.is_auto_renewed ? '✓' : '✗'}`);
      console.log(`    Próximo pago: ${new Date(sub.next_billing_at).toLocaleDateString()}`);
    });

    console.log('\n✅ Dashboard generado exitosamente');
  } catch (error) {
    console.error('❌ Error al generar dashboard:', error);
  }
}

// ============================================
// EJECUTAR EJEMPLOS
// ============================================

async function ejecutarTodos() {
  await crearDashboard();
  // await ejemplosVPS();
  // await ejemplosDominios();
  // await ejemplosDNS();
  // await ejemplosBilling();
}

// Exportar funciones para uso externo
export {
  ejemplosVPS,
  ejemplosDominios,
  ejemplosDNS,
  ejemplosBilling,
  crearDashboard,
  ejecutarTodos
};

// Si se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  ejecutarTodos();
}
