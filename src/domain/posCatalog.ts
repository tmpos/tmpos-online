import { matchesSearch } from '@/composables/useSearch'

type CatalogInput = {
  tab: string
  query: string
  hideOutOfStock: boolean
  phones: any[]
  appliances: any[]
  accessories: any[]
  imeis: any[]
  serials: any[]
  imeiBelongsToPhone: (imei: any, phone: any) => boolean
  serialBelongsToAppliance: (serial: any, appliance: any) => boolean
}

export type PosGlobalSearchResult = {
  key: string
  type: 'telefono' | 'imei' | 'electrodomestico' | 'serial' | 'accesorio'
  item: any
  parent?: any
}

export function searchGlobalPosCatalog(input: Omit<CatalogInput, 'tab'>): PosGlobalSearchResult[] {
  const query = input.query.trim()
  if (!query) return []

  const results: PosGlobalSearchResult[] = []
  const phones = input.hideOutOfStock
    ? input.phones.filter(phone => input.imeis.some(imei => input.imeiBelongsToPhone(imei, phone)))
    : input.phones
  const appliances = input.hideOutOfStock
    ? input.appliances.filter(appliance => input.serials.some(serial => input.serialBelongsToAppliance(serial, appliance)))
    : input.appliances
  const accessories = input.hideOutOfStock
    ? input.accessories.filter(item => Number(item.cantidad || 0) > 0)
    : input.accessories

  for (const phone of phones) {
    if (matchesSearch(phone, query, ['nombre', 'marca', 'modelo', 'codigo_barra', 'codigo'])) {
      results.push({ key: `telefono-${phone.id}`, type: 'telefono', item: phone })
    }
  }
  for (const imei of input.imeis) {
    if (!matchesSearch(imei, query, ['nombre', 'imei', 'color', 'capacidad', 'codigo_barra'])) continue
    const parent = input.phones.find(phone => input.imeiBelongsToPhone(imei, phone))
    results.push({ key: `imei-${imei.id}`, type: 'imei', item: imei, parent })
  }
  for (const appliance of appliances) {
    if (matchesSearch(appliance, query, ['nombre', 'marca', 'modelo', 'codigo_barra', 'codigo'])) {
      results.push({ key: `electrodomestico-${appliance.id}`, type: 'electrodomestico', item: appliance })
    }
  }
  for (const serial of input.serials) {
    if (!matchesSearch(serial, query, ['nombre', 'serial', 'color', 'capacidad', 'codigo_barra'])) continue
    const parent = input.appliances.find(appliance => input.serialBelongsToAppliance(serial, appliance))
    results.push({ key: `serial-${serial.id}`, type: 'serial', item: serial, parent })
  }
  for (const accessory of accessories) {
    if (matchesSearch(accessory, query, ['nombre', 'marca_nombre', 'marca', 'modelo', 'codigo_barra', 'codigo'])) {
      results.push({ key: `accesorio-${accessory.id}`, type: 'accesorio', item: accessory })
    }
  }

  return results
}

export function filterPosCatalog(input: CatalogInput): any[] {
  const { tab, query, hideOutOfStock } = input
  if (tab === 'celulares') {
    let data = input.phones
    if (hideOutOfStock) data = data.filter(phone => input.imeis.some(imei => input.imeiBelongsToPhone(imei, phone)))
    const matchingImeis = input.imeis.filter(imei => matchesSearch(imei, query, ['nombre']))
    return data.filter(phone => matchesSearch(phone, query, ['nombre', 'marca', 'modelo', 'codigo_barra']) || matchingImeis.some(imei => input.imeiBelongsToPhone(imei, phone)))
  }
  if (tab === 'electrodomesticos') {
    let data = input.appliances
    if (hideOutOfStock) data = data.filter(appliance => input.serials.some(serial => input.serialBelongsToAppliance(serial, appliance)))
    const matchingSerials = input.serials.filter(serial => matchesSearch(serial, query, ['nombre']))
    return data.filter(appliance => matchesSearch(appliance, query, ['nombre', 'marca', 'modelo', 'codigo_barra']) || matchingSerials.some(serial => input.serialBelongsToAppliance(serial, appliance)))
  }
  if (tab === 'accesorios') {
    const data = hideOutOfStock ? input.accessories.filter(item => Number(item.cantidad || 0) > 0) : input.accessories
    return data.filter(item => matchesSearch(item, query, ['nombre', 'marca_nombre', 'codigo_barra', 'codigo']))
  }
  return []
}

export function filterPosCustomers(customers: any[], query: string): any[] {
  return customers.filter(customer => matchesSearch(customer, query, ['nombre', 'telefono', 'whatsapp', 'rnc', 'cedula', 'codigo']))
}
