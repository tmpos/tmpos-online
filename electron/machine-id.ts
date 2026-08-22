import { execSync } from 'child_process'
import crypto from 'crypto'

function run(cmd: string, timeout = 5000): string {
  try {
    return execSync(cmd, { timeout, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function clean(val: string): string {
  return val
    .replace(/[\r\n\t]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const INVALID = /^(|UNKNOWN|0+|NONE|NOT.?SPECIFIED|TO.?BE.?FILLED|DEFAULT|EMPTY|SERIAL|NA|N\/A|S\/N|123456789|0123456789|00000000-0000-0000-0000-000000000000)$/i

function esValido(val: string): boolean {
  return val.length >= 3 && !INVALID.test(val)
}

export function getMachineId(): string {
  const platform = process.platform
  const partes: string[] = []

  if (platform === 'win32') {
    const metodos = [
      `powershell -NoProfile -Command "Get-CimInstance -Class Win32_ComputerSystemProduct | Select-Object -ExpandProperty UUID"`,
      `powershell -NoProfile -Command "Get-CimInstance -Class Win32_BIOS | Select-Object -ExpandProperty SerialNumber"`,
      `powershell -NoProfile -Command "Get-CimInstance -Class Win32_BaseBoard | Select-Object -ExpandProperty SerialNumber"`,
      `wmic csproduct get UUID`,
      `wmic bios get serialnumber`,
      `wmic baseboard get serialnumber`,
    ]
    for (const cmd of metodos) {
      const raw = clean(run(cmd))
      const val = raw.replace(/^[^\n]+\n/, '').trim()
      if (esValido(val)) partes.push(val)
      if (partes.length >= 3) break
    }
  } else if (platform === 'darwin') {
    const hw = clean(run('system_profiler SPHardwareDataType'))
    const uuid = (hw.match(/Hardware UUID:\s*(.+)/i)?.[1] || '').trim()
    const serial = (hw.match(/Serial Number\s*\(system\):\s*(.+)/i)?.[1] || hw.match(/Serial Number:\s*(.+)/i)?.[1] || '').trim()
    const model = (hw.match(/Model Identifier:\s*(.+)/i)?.[1] || '').trim()
    if (esValido(uuid)) partes.push(uuid)
    if (esValido(serial)) partes.push(serial)
    if (esValido(model)) partes.push(model)
    if (partes.length < 2) {
      const ioreg = clean(run('ioreg -rd1 -c IOPlatformExpertDevice'))
      const sn = (ioreg.match(/IOPlatformSerialNumber["\s]*=["\s]*([^\s"]+)/i)?.[1] || '').trim()
      if (esValido(sn) && serial !== sn) partes.push(sn)
    }
  } else {
    const rutas = [
      '/sys/class/dmi/id/product_uuid',
      '/sys/class/dmi/id/board_serial',
      '/sys/class/dmi/id/product_serial',
      '/sys/class/dmi/id/product_name',
    ]
    for (const r of rutas) {
      const val = clean(run(`cat "${r}" 2>/dev/null || echo ""`))
      if (esValido(val)) partes.push(val)
      if (partes.length >= 2) break
    }
    if (partes.length === 0) {
      const dmidecode = clean(run('dmidecode -s system-uuid 2>/dev/null || echo ""'))
      if (esValido(dmidecode)) partes.push(dmidecode)
    }
  }

  const raw = `${platform}|${partes.join('|')}`
  const hash = crypto.createHash('sha256').update(raw, 'utf8').digest('hex').toUpperCase()
  const id = hash.slice(0, 16)
  return `TMPOS-${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}`
}

export function getMachineIdLegacy(): string {
  const id = getMachineId()
  const hash = crypto.createHash('md5').update(id, 'utf8').digest('hex').toUpperCase()
  return hash.slice(0, 12)
}
