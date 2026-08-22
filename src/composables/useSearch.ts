import { computed, onUnmounted, ref, watch, type Ref } from 'vue'

export function normalizeSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function compactSearch(value: unknown): string {
  return normalizeSearch(value).replace(/\s+/g, '')
}

export function matchesSearch<T extends Record<string, any>>(
  row: T,
  query: unknown,
  fields: Array<keyof T | ((item: T) => unknown)>,
): boolean {
  const normalized = normalizeSearch(query)
  if (!normalized) return true
  const compact = compactSearch(query)
  return fields.some(field => {
    const value = typeof field === 'function' ? field(row) : row[field]
    const candidate = normalizeSearch(value)
    return candidate.includes(normalized) || compactSearch(value).includes(compact)
  })
}

export function useDebouncedSearch(initial = '', delay = 250) {
  const query = ref(initial)
  const debouncedQuery = ref(initial)
  let timer: ReturnType<typeof setTimeout> | undefined

  watch(query, value => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { debouncedQuery.value = value }, delay)
  })

  onUnmounted(() => { if (timer) clearTimeout(timer) })
  return { query, debouncedQuery }
}

export function useFilteredSearch<T extends Record<string, any>>(
  source: Ref<T[]>,
  fields: Array<keyof T | ((item: T) => unknown)>,
  options: { initial?: string; delay?: number } = {},
) {
  const { query, debouncedQuery } = useDebouncedSearch(options.initial, options.delay)
  const results = computed(() => source.value.filter(row => matchesSearch(row, debouncedQuery.value, fields)))
  return { query, debouncedQuery, results }
}
