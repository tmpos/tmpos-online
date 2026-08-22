import { enUS } from './en-US'

const originals = new WeakMap<Node, string>()
const attributeOriginals = new WeakMap<Element, Map<string, string>>()
const translatedAttributes = ['placeholder', 'title', 'aria-label']
let observer: MutationObserver | null = null

function language() {
  return localStorage.getItem('sistema_idioma') || 'es'
}

function translateText(value: string): string {
  if (!language().startsWith('en')) return value
  const leading = value.match(/^\s*/)?.[0] || ''
  const trailing = value.match(/\s*$/)?.[0] || ''
  const clean = value.trim()
  if (!clean) return value
  if (enUS[clean]) return `${leading}${enUS[clean]}${trailing}`
  let result = clean
  const phrases = Object.entries(enUS).sort((a, b) => b[0].length - a[0].length)
  for (const [source, target] of phrases) {
    if (source.length < 5 || !result.includes(source)) continue
    result = result.split(source).join(target)
  }
  return `${leading}${result}${trailing}`
}

function processText(node: Text) {
  if (!originals.has(node)) originals.set(node, node.data)
  const original = originals.get(node) || node.data
  const next = translateText(original)
  if (node.data !== next) node.data = next
}

function processElement(element: Element) {
  if (element.closest('[data-no-translate]')) return
  for (const attr of translatedAttributes) {
    if (!element.hasAttribute(attr)) continue
    let values = attributeOriginals.get(element)
    if (!values) { values = new Map(); attributeOriginals.set(element, values) }
    if (!values.has(attr)) values.set(attr, element.getAttribute(attr) || '')
    element.setAttribute(attr, translateText(values.get(attr) || ''))
  }
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) processText(child as Text)
    else if (child.nodeType === Node.ELEMENT_NODE) processElement(child as Element)
  }
}

export function applyRuntimeLanguage() {
  document.documentElement.lang = language()
  processElement(document.body)
}

export function initRuntimeI18n() {
  applyRuntimeLanguage()
  observer?.disconnect()
  observer = new MutationObserver(records => {
    observer?.disconnect()
    for (const record of records) {
      if (record.type === 'characterData') {
        originals.set(record.target, (record.target as Text).data)
        processText(record.target as Text)
      }
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType === Node.TEXT_NODE) processText(node as Text)
        else if (node.nodeType === Node.ELEMENT_NODE) processElement(node as Element)
      }
    }
    observer?.observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  window.addEventListener('system-locale-changed', applyRuntimeLanguage)
}
