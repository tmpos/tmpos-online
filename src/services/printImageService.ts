import { ensureConfigLoaded, getConfig, getImageUrl } from '@/services/tmCloudClient'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

export async function resolvePrintableImage(value: any): Promise<string> {
  const source = String(value || '').trim()
  if (!source || /^data:/i.test(source)) return source

  try {
    await ensureConfigLoaded()
    const imageUrl = /^(https?:\/\/|file:|blob:)/i.test(source) ? source : getImageUrl(source)
    if (!imageUrl || /^(file:|blob:)/i.test(imageUrl)) return imageUrl || source
    const key = getConfig()?.key || ''
    const response = await fetch(imageUrl, { headers: key ? { Authorization: `Bearer ${key}` } : {} })
    if (!response.ok) return imageUrl
    const contentType = response.headers.get('content-type') || 'image/png'
    return `data:${contentType};base64,${arrayBufferToBase64(await response.arrayBuffer())}`
  } catch {
    return source
  }
}
