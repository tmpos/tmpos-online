export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Removes active content while preserving the inline markup needed by tickets and previews. */
export function sanitizePrintableHtml(html: unknown): string {
  const source = String(html ?? '')
  if (typeof DOMParser === 'undefined') return source
  const document = new DOMParser().parseFromString(source, 'text/html')
  document.querySelectorAll('script, iframe, object, embed, base, meta[http-equiv="refresh"]').forEach(node => node.remove())
  document.querySelectorAll('*').forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (name.startsWith('on') || ((name === 'href' || name === 'src' || name === 'xlink:href') && value.startsWith('javascript:'))) {
        element.removeAttribute(attribute.name)
      }
    }
  })
  return '<!doctype html>\n' + document.documentElement.outerHTML
}
