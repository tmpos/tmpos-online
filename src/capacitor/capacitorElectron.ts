import { uuidv4 } from './util'
import { dbAssignAllWarehouse, dbExecuteSQL, dbGetAll, dbGetTableColumns, dbInsert, dbUpdate } from './capacitorDb'

function getOpenAIError(data: any, status: number): string {
  const code = String(data?.error?.code || data?.error?.type || '')
  const message = String(data?.error?.message || '')
  if (code === 'insufficient_quota' || /exceeded your current quota/i.test(message)) {
    return 'La cuenta de API de OpenAI no tiene crédito o cuota disponible. ChatGPT y la API se facturan por separado; revisa Billing en platform.openai.com.'
  }
  if (code === 'model_not_found' || /model.*does not exist|access to it/i.test(message)) {
    return 'La API key no tiene acceso al modelo seleccionado. Elige otro modelo en Configuración > OpenAI / Jarvis.'
  }
  if (status === 401) return 'La API key de OpenAI no es válida o fue revocada.'
  if (status === 429) return 'OpenAI rechazó la solicitud por límite de uso. Revisa la cuota y los límites del proyecto de API.'
  return message || `OpenAI respondió con HTTP ${status}`
}

function obtenerMacAddress(): string {
  return uuidv4().replace(/-/g, '').toUpperCase().slice(0, 12)
}

function cifrarBase64(valor: string): string {
  return btoa(String(valor || '').trim().toUpperCase())
}

function calcularDiasRestantes(fechaVencimiento?: string): number | null {
  if (!fechaVencimiento) return null
  return Math.ceil((new Date(fechaVencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

let _macAddress = obtenerMacAddress()
let _licenciaCifrada = cifrarBase64(_macAddress)
let _estadoLicencia = 'sin_verificar'
let _nombreEmpresa = ''
let _fechaVencimiento = ''

export async function initLicencia() {
  try {
    const res = await (window as any).db.getAll('licencia')
    if (res.success && res.data && res.data.length > 0) {
      const lic = res.data[0]
      _estadoLicencia = lic.estado || 'sin_verificar'
      _nombreEmpresa = lic.nombre_empresa || ''
      _fechaVencimiento = lic.fecha_vencimiento || ''
    }
  } catch {}
}

export async function handleElectronInvoke(channel: string, ...args: any[]): Promise<any> {
  switch (channel) {
    case 'correo-local:getConfig': {
      const result = dbGetAll('correo')
      return result.success ? { success: true, data: result.data?.[0] } : result
    }

    case 'correo-local:saveConfig': {
      const payload = args[0] || {}
      const result = dbGetAll('correo')
      if (!result.success) return result
      const current = result.data?.[0]
      return current?.id ? dbUpdate('correo', Number(current.id), payload) : dbInsert('correo', payload)
    }

    case 'empresa-local:ensureColumns': {
      const sample = args[0] || {}
      const existing = new Set(dbGetTableColumns('empresa').map((column: any) => String(column.name)))
      const added: string[] = []
      for (const [column, value] of Object.entries(sample)) {
        if (column === 'id' || existing.has(column) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(column)) continue
        const type = typeof value === 'number' ? (Number.isInteger(value) ? 'INTEGER' : 'REAL') : typeof value === 'boolean' ? 'INTEGER' : 'TEXT'
        const result = dbExecuteSQL(`ALTER TABLE empresa ADD COLUMN "${column}" ${type}`)
        if (!result.success) return result
        existing.add(column)
        added.push(column)
      }
      return { success: true, data: { added } }
    }

    case 'db:getAll':
      return (window as any).db.getAll(args[0])

    case 'db:getWhere':
      return (window as any).db.getWhere(args[0], args[1], args[2] || [])

    case 'db:getModified':
      return (window as any).db.getModified(args[0], args[1] || '')

    case 'db:getById':
      return (window as any).db.getById(args[0], args[1])

    case 'db:insert':
      return (window as any).db.insert(args[0], args[1] || {})

    case 'db:insertCloud':
      return (window as any).db.insert(args[0], args[1] || {})

    case 'db:update':
      return (window as any).db.update(args[0], args[1], args[2] || {})

    case 'db:updateCloud':
      return (window as any).db.update(args[0], args[1], args[2] || {})

    case 'db:delete':
      return (window as any).db.delete(args[0], args[1])

    case 'db:deleteLocalOnly':
      return (window as any).db.deleteLocalOnly(args[0], args[1])

    case 'db:exec':
      return dbExecuteSQL(String(args[0] || ''))

    case 'almacen:asignarTodosLosDatos':
      return dbAssignAllWarehouse(Number(args[0]?.almacen_id || 0), String(args[0]?.almacen_uid || ''))

    case 'config:get':
      return (window as any).config.get(args[0])

    case 'config:set':
      return (window as any).config.set(args[0], args[1])

    case 'openai:getConfig': {
      const keys = await Promise.all([
        (window as any).config.get('openai_api_key'),
        (window as any).config.get('openai_enabled'),
        (window as any).config.get('openai_model'),
        (window as any).config.get('openai_voice_enabled'),
        (window as any).config.get('openai_voice'),
      ])
      const apiKey = String(keys[0]?.data || '')
      return {
        success: true,
        data: {
          enabled: String(keys[1]?.data || '') === '1',
          model: String(keys[2]?.data || '') || 'gpt-5.6-sol',
          voice_enabled: String(keys[3]?.data || '') !== '0',
          voice: String(keys[4]?.data || '') || 'es-DO',
          has_api_key: Boolean(apiKey),
          masked_api_key: apiKey ? `${apiKey.slice(0, 7)}••••••••${apiKey.slice(-4)}` : '',
        },
      }
    }

    case 'openai:saveConfig': {
      const payload = args[0] || {}
      const apiKey = String(payload.api_key || '').trim()
      if (apiKey && !apiKey.startsWith('sk-')) return { success: false, error: 'La API key debe comenzar con sk-' }
      if (apiKey) await (window as any).config.set('openai_api_key', apiKey)
      if (payload.clear_api_key) await (window as any).config.set('openai_api_key', '')
      await Promise.all([
        (window as any).config.set('openai_enabled', payload.enabled === true ? '1' : '0'),
        (window as any).config.set('openai_model', String(payload.model || 'gpt-5.6-sol')),
        (window as any).config.set('openai_voice_enabled', payload.voice_enabled === false ? '0' : '1'),
        (window as any).config.set('openai_voice', String(payload.voice || 'es-DO')),
      ])
      const actual = await (window as any).config.get('openai_api_key')
      const configured = Boolean(actual?.data)
      await (window as any).config.set('openai_api_key_configured', configured ? '1' : '0')
      return { success: true, data: { has_api_key: configured } }
    }

    case 'openai:request': {
      const keyRes = await (window as any).config.get('openai_api_key')
      const apiKey = String(keyRes?.data || '').trim()
      if (!apiKey) return { success: false, error: 'OpenAI no está configurado. Agrega la API key en Configuración.' }
      try {
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(args[0] || {}),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) return { success: false, error: getOpenAIError(data, response.status) }
        return { success: true, data }
      } catch (error: any) {
        return { success: false, error: error?.message || 'No se pudo conectar con OpenAI' }
      }
    }

    case 'openai:transcribe': {
      const keyRes = await (window as any).config.get('openai_api_key')
      const apiKey = String(keyRes?.data || '').trim()
      if (!apiKey) return { success: false, error: 'OpenAI no está configurado. Agrega la API key en Configuración.' }
      try {
        const payload = args[0] || {}
        const binary = atob(String(payload.audio_base64 || ''))
        if (!binary.length) return { success: false, error: 'La grabación de audio está vacía' }
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const rawMimeType = String(payload.mime_type || 'audio/webm').split(';')[0].toLowerCase()
        const mimeType = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg'].includes(rawMimeType)
          ? rawMimeType
          : 'audio/webm'
        const extension: Record<string, string> = {
          'audio/webm': 'webm',
          'audio/mp4': 'm4a',
          'audio/mpeg': 'mp3',
          'audio/wav': 'wav',
          'audio/ogg': 'ogg',
        }
        const form = new FormData()
        form.append('file', new Blob([bytes], { type: mimeType }), `jarvis.${extension[mimeType] || 'webm'}`)
        form.append('model', 'gpt-4o-mini-transcribe')
        form.append('language', String(payload.language || 'es').slice(0, 2))
        form.append('response_format', 'json')
        form.append('prompt', 'Conversación en español sobre ventas, clientes, facturas, inventario, teléfonos e IMEI en el sistema TMPOS.')
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        })
        const data = await response.json().catch(() => ({})) as any
        if (!response.ok) return { success: false, error: getOpenAIError(data, response.status) }
        return { success: true, data: { text: String(data?.text || '').trim() } }
      } catch (error: any) {
        return { success: false, error: error?.message || 'No se pudo transcribir el audio' }
      }
    }

    case 'tmcloud:getConfig': {
      const res = await (window as any).db.getById('tmcloud_config', 1)
      return { success: true, data: res?.data || { url: '', public_key: '', secret_key: '' } }
    }

    case 'tmcloud:saveConfig': {
      const payload = args[0] || {}
      const actual = await (window as any).db.getById('tmcloud_config', 1)
      const data = {
        url: String(payload.url || '').trim().replace(/\/+$/, ''),
        public_key: String(payload.public_key || '').trim(),
        secret_key: String(payload.secret_key || '').trim(),
      }
      const res = actual?.success && actual.data
        ? await (window as any).db.update('tmcloud_config', 1, data)
        : await (window as any).db.insert('tmcloud_config', { id: 1, ...data })
      return res.success ? { success: true, data } : res
    }

    case 'caja:getTurnoActivo':
    case 'caja:getTurnoAbierto': {
      const res = await (window as any).db.getAll('caja_turnos')
      const almacenUid = String(args[0] || localStorage.getItem('almacen_uid') || localStorage.getItem('almacen_default_uid') || '')
      const almacenId = Number(localStorage.getItem('almacen_id') || localStorage.getItem('almacen_default_id') || 0)
      const turno = (res.data || []).find((item: any) => {
        if (String(item.estado || '').toLowerCase() !== 'abierto') return false
        if (almacenUid && item.almacen_uid) return String(item.almacen_uid) === almacenUid
        if (almacenId && Number(item.almacen_id)) return Number(item.almacen_id) === almacenId
        return false
      }) || null
      return { success: true, data: turno }
    }

    case 'caja:abrirTurno': {
      const data = args[0] || {}
      return (window as any).db.insert('caja_turnos', {
        monto_inicial: Number(data.monto_inicial || 0),
        entradas: 0,
        retiros: 0,
        estado: 'abierto',
        observacion: data.observacion || '',
        usuario_id: Number(data.usuario_id || 0),
        usuario_nombre: data.usuario_nombre || '',
        almacen_id: Number(data.almacen_id || localStorage.getItem('almacen_id') || 0),
        almacen_uid: String(data.almacen_uid || localStorage.getItem('almacen_uid') || ''),
      })
    }

    case 'caja:cerrarTurno': {
      const cierre = args[1] || {}
      return (window as any).db.update('caja_turnos', args[0], {
        estado: 'cerrado',
        monto_final: Number(cierre.monto_final || 0),
        efectivo_esperado: Number(cierre.efectivo_esperado || 0),
        diferencia: Number(cierre.diferencia || 0),
        cierre_ciego: cierre.cierre_ciego ? 1 : 0,
      })
    }

    case 'getServerUrl':
      return { success: true, url: window.location.origin }

    case 'licencia:getMacAddress':
      return { success: true, data: { mac: _macAddress, cifrada: _licenciaCifrada } }

    case 'licencia:getInfo':
      return {
        success: true,
        data: {
          licencia_equipo: _macAddress,
          licencia_cifrada: _licenciaCifrada,
          estado: _estadoLicencia,
          estado_display: _estadoLicencia === 'activo' ? 'Activa' : _estadoLicencia === 'pendiente' ? 'Pendiente' : 'Sin verificar',
          nombre_empresa: _nombreEmpresa,
          dias_restantes: calcularDiasRestantes(_fechaVencimiento),
          ultima_verificacion: new Date().toISOString(),
          fecha_vencimiento: _fechaVencimiento,
        },
      }

    case 'licencia:setApiKey':
      try {
        await (window as any).db.getAll('licencia').then(async (res: any) => {
          if (res.success && res.data && res.data.length > 0) {
            await (window as any).db.update('licencia', res.data[0].id, { api_key: args[0] || '' })
          }
        })
        return { success: true }
      } catch (e: any) {
        return { success: false, error: e.message }
      }

    case 'licencia:getApiKey':
      try {
        const res = await (window as any).db.getAll('licencia')
        const apiKey = res.success && res.data && res.data.length > 0 ? res.data[0].api_key : null
        return { success: true, data: { configurada: !!apiKey } }
      } catch {
        return { success: true, data: { configurada: false } }
      }

    case 'licencia:registrar':
      try {
        const payload = args[0] || {}
        const mac = _macAddress
        const now = new Date().toISOString()
        const fechaVenc = payload.proximopago || new Date(Date.now() + 7 * 86400000).toISOString()
        await (window as any).db.getAll('licencia').then(async (res: any) => {
          if (res.success && res.data && res.data.length > 0) {
            await (window as any).db.update('licencia', res.data[0].id, {
              licencia_equipo: mac,
              licencia_cifrada: _licenciaCifrada,
              estado: 'PENDIENTE',
              nombre_empresa: payload.nombre || '',
              fecha_inicio_prueba: now,
              fecha_vencimiento: fechaVenc,
              ultima_verificacion: now,
            })
          }
        })
        _estadoLicencia = 'PENDIENTE'
        _nombreEmpresa = payload.nombre || ''
        _fechaVencimiento = fechaVenc
        return { success: true, data: { mensaje: 'Licencia registrada correctamente' } }
      } catch (e: any) {
        return { success: false, error: e.message }
      }

    case 'licencia:verificar': {
      const offlineMode = true
      const diasRestantes = calcularDiasRestantes(_fechaVencimiento) || 365
      const success = _estadoLicencia === 'activo' || _estadoLicencia === 'pendiente' || _estadoLicencia === 'sin_verificar'
      const effectiveDias = _estadoLicencia === 'sin_verificar' ? 7 : diasRestantes
      return {
        success,
        estado: success ? 'activo' : 'vencida',
        data: {
          estado: success ? 'activo' : 'vencida',
          mensaje: success ? `Licencia activa - ${effectiveDias} dia(s) restantes` : 'Licencia vencida',
          diasRestantes: effectiveDias,
        },
        verificadoOnline: false,
      }
    }

    case 'enviar:testEmail':
      return { success: true, message: 'Correo de prueba enviado (simulado)' }

    case 'enviar:cierreCaja': {
      try {
        const payload = args[0] || {}
        const configResult = await (window as any).db.getAll('tmcloud_config')
        const config = configResult?.data?.[0] || {}
        const baseUrl = String(config.url || '').replace(/\/+$/, '')
        const secretKey = String(config.secret_key || '').trim()
        const toEmail = String(payload.toEmail || '').trim()
        if (!baseUrl || !secretKey) {
          return { success: false, error: 'Configura la URL y Secret Key de TM Cloud para enviar el cierre' }
        }
        if (!toEmail.includes('@')) {
          return { success: false, error: 'Configura un correo valido en los datos de la empresa' }
        }
        // La API solo acepta plantillas registradas. En un proyecto nuevo la
        // primera llamada puede crear la cola interna y devolver temporalmente
        // "Table not found"; se reintenta una sola vez para completar el
        // bootstrap del servidor.
        const mailPayload = {
          template: 'cash_closing',
          to: toEmail,
          data: payload.data || {},
          send_now: true,
        }
        let response: Response | null = null
        let responseData: any = {}
        const maxAttempts = 4
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          response = await fetch(`${baseUrl}/mail/send`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(mailPayload),
          })
          responseData = await response.json().catch(() => ({}))
          if (response.ok) break
          const message = String(responseData?.error?.message || responseData?.error || responseData?.message || '')
          const transient = /table\s+not\s+found|tabla.+no\s+(?:existe|encontr)|database\s+is\s+locked|sqlstate\[hy000\].*(?:error:\s*5|database\s+is\s+locked)|sqlite_busy/i.test(message)
          if (attempt < maxAttempts - 1 && transient) {
            await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)))
            continue
          }
          break
        }
        if (!response) return { success: false, error: 'La API no produjo una respuesta' }
        if (!response.ok) {
          return {
            success: false,
            error: responseData?.error?.message || responseData?.message || `HTTP ${response.status}`,
          }
        }
        const mail = responseData?.data?.mail || responseData?.data || {}
        const sent = String(mail.status || '').toLowerCase() === 'sent'
        return {
          success: true,
          queued: !sent,
          provider: 'TMPBASE API',
          mailUid: mail.uid || '',
          status: mail.status || 'pending',
          message: sent
            ? `Cierre enviado por TMPBASE a ${toEmail}`
            : `Cierre encolado por TMPBASE para ${toEmail}`,
          toEmail,
        }
      } catch (error: any) {
        return { success: false, error: error?.message || 'No se pudo enviar el cierre mediante TMPBASE' }
      }
    }

    case 'consultaservidor':
      return handleConsultaservidor(args[0], args.slice(1))

    case 'print:ticket': {
      const html = args[0] || ''
      try {
        const printWindow = window.open('', '_blank', 'width=480,height=800')
        if (printWindow) {
          printWindow.document.write(sanitizePrintableHtml(html))
          printWindow.document.close()
          printWindow.focus()
          setTimeout(() => {
            printWindow.print()
            setTimeout(() => printWindow.close(), 500)
          }, 500)
        }
      } catch {}
      return { success: true }
    }

    case 'generate:pdf':
      return { success: true, dataUrl: '' }

    case 'pdf:generateToFile':
      return { success: true, filePath: '' }

    case 'save:pdf':
      return { success: true }

    case 'backup:create':
      return { success: true }

    case 'backup:list':
      return { success: true, data: [] }

    case 'backup:download':
      return { success: false, error: 'No disponible en Android' }

    case 'backup:delete':
      return { success: true }

    case 'backup:restore':
      return { success: false, error: 'No disponible en Android' }

    case 'getPrinters':
      return { success: true, data: [] }

    case 'scan:bluetooth':
      return { success: true, data: [] }

    case 'print:bluetooth-raw':
      return { success: true }

    case 'app:getVersion':
      return '2.7.0'

    case 'app:getName':
      return 'MR Cutti Technology'

    case 'app:getConfig':
      return { success: false, error: 'No disponible en Android' }

    case 'update:check':
      return { success: false, error: 'No disponible en Android' }

    case 'update:download':
      return { success: false, error: 'No disponible en Android' }

    case 'update:downloadAuto':
      return { success: false, error: 'No disponible en Android' }

    case 'update:install':
      return { success: false, error: 'No disponible en Android' }

    case 'imei:consultar':
      try {
        const response = await fetch('https://demo.tmposrd.com/api2/consultaimei', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args[0] || {}),
        })
        const data = await response.json()
        return { success: true, data }
      } catch (e: any) {
        return { success: false, error: e.message }
      }

    case 'open:devtools':
      return { success: true }

    case 'clipboard:copyFile':
      return { success: true }

    default:
      console.warn('[CapacitorElectron] Unhandled channel:', channel, args)
      return { success: false, error: 'No disponible en Android' }
  }
}

async function handleConsultaservidor(action: string, args: any[]): Promise<any> {
  switch (action) {
    case 'getAllConfig':
      return {
        VITE_LINKURL: '',
        VITE_LINK_API: '',
        VITE_TOKEN: '',
        VITE_PATRON_TELEFONO: '^[0-9]{10}$',
        VITE_IMPRESORA_LOCAL: '',
        VITE_PATRON_CEDULA: '^[0-9]{11}$',
        VITE_TOKEN_CORTO: '',
      }

    case 'tableExists':
      return (window as any).db?.getAll(args[0]).then((r: any) =>
        r.success && r.data && r.data.length > 0 ? ['ok'] : ['error']
      )

    case 'getTableColumns':
      return (window as any).db?.getAll(args[0]).then((r: any) => {
        if (r.success && r.data && r.data.length > 0) {
          return Object.keys(r.data[0]).map((name: string) => ({ name, type: 'TEXT' }))
        }
        return []
      })

    case 'getAllTables':
      return { data: [] }

    case 'rawQuery':
      return { success: false, error: 'No disponible directamente' }

    case 'executeSQL':
      return { success: false, error: 'Usar db API en su lugar' }

    case 'vaciarTabla':
      return { success: false, error: 'No disponible directamente' }

    case 'eliminarTabla':
      return { success: false, error: 'No disponible directamente' }

    case 'getCreateTableSQL':
      return { success: true, sql: '' }

    case 'getTableRowCount':
      return { success: true, count: 0 }

    case 'crearTabla':
      return { success: false, error: 'No disponible directamente' }

    case 'addColumnToTable':
      return ['ok']

    default:
      return null
  }
}
import { sanitizePrintableHtml } from '@/utils/htmlSecurity'
