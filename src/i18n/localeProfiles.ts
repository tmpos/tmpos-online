export type TaxProfile = {
  shortName: string
  fullName: string
  defaultRate: number
  businessIdLabel: string
  personalIdLabel: string
  customerIdLabel: string
  fiscalDocumentLabel: string
  fiscalDocumentsLabel: string
  taxAuthority: string
  electronicProviderEnabled: boolean
}

export type LocaleProfile = {
  country: string
  language: 'es' | 'en-US'
  locale: string
  currency: string
  currencySymbol: string
  dateFormat: string
  timeZone: string
  tax: TaxProfile
}

export const localeProfiles: Record<string, LocaleProfile> = {
  DO: { country: 'DO', language: 'es', locale: 'es-DO', currency: 'DOP', currencySymbol: 'RD$', dateFormat: 'DD/MM/YYYY', timeZone: 'America/Santo_Domingo', tax: { shortName: 'ITBIS', fullName: 'Impuesto sobre Transferencias de Bienes Industrializados y Servicios', defaultRate: 18, businessIdLabel: 'RNC', personalIdLabel: 'Cédula', customerIdLabel: 'RNC / Cédula', fiscalDocumentLabel: 'NCF', fiscalDocumentsLabel: 'Comprobantes fiscales', taxAuthority: 'DGII', electronicProviderEnabled: true } },
  AR: { country: 'AR', language: 'es', locale: 'es-AR', currency: 'ARS', currencySymbol: '$', dateFormat: 'DD/MM/YYYY', timeZone: 'America/Argentina/Buenos_Aires', tax: { shortName: 'IVA', fullName: 'Impuesto al Valor Agregado', defaultRate: 21, businessIdLabel: 'CUIT', personalIdLabel: 'DNI', customerIdLabel: 'CUIT / DNI', fiscalDocumentLabel: 'CAE', fiscalDocumentsLabel: 'Comprobantes fiscales', taxAuthority: 'ARCA', electronicProviderEnabled: false } },
  US: { country: 'US', language: 'en-US', locale: 'en-US', currency: 'USD', currencySymbol: '$', dateFormat: 'MM/DD/YYYY', timeZone: 'America/New_York', tax: { shortName: 'Sales Tax', fullName: 'Sales Tax', defaultRate: 0, businessIdLabel: 'EIN', personalIdLabel: 'ID', customerIdLabel: 'Tax ID / ID', fiscalDocumentLabel: 'Tax document', fiscalDocumentsLabel: 'Tax documents', taxAuthority: 'IRS', electronicProviderEnabled: false } },
  MX: { country: 'MX', language: 'es', locale: 'es-MX', currency: 'MXN', currencySymbol: '$', dateFormat: 'DD/MM/YYYY', timeZone: 'America/Mexico_City', tax: { shortName: 'IVA', fullName: 'Impuesto al Valor Agregado', defaultRate: 16, businessIdLabel: 'RFC', personalIdLabel: 'CURP', customerIdLabel: 'RFC / CURP', fiscalDocumentLabel: 'Folio fiscal', fiscalDocumentsLabel: 'Comprobantes fiscales', taxAuthority: 'SAT', electronicProviderEnabled: false } },
  CA: { country: 'CA', language: 'en-US', locale: 'en-CA', currency: 'CAD', currencySymbol: 'CA$', dateFormat: 'YYYY-MM-DD', timeZone: 'America/Toronto', tax: { shortName: 'GST/HST', fullName: 'Goods and Services Tax / Harmonized Sales Tax', defaultRate: 5, businessIdLabel: 'BN', personalIdLabel: 'ID', customerIdLabel: 'BN / ID', fiscalDocumentLabel: 'Tax document', fiscalDocumentsLabel: 'Tax documents', taxAuthority: 'CRA', electronicProviderEnabled: false } },
  BR: { country: 'BR', language: 'es', locale: 'pt-BR', currency: 'BRL', currencySymbol: 'R$', dateFormat: 'DD/MM/YYYY', timeZone: 'America/Sao_Paulo', tax: { shortName: 'ICMS', fullName: 'Imposto sobre Circulação de Mercadorias e Serviços', defaultRate: 18, businessIdLabel: 'CNPJ', personalIdLabel: 'CPF', customerIdLabel: 'CNPJ / CPF', fiscalDocumentLabel: 'Chave fiscal', fiscalDocumentsLabel: 'Documentos fiscais', taxAuthority: 'Receita Federal', electronicProviderEnabled: false } },
  CO: { country: 'CO', language: 'es', locale: 'es-CO', currency: 'COP', currencySymbol: '$', dateFormat: 'DD/MM/YYYY', timeZone: 'America/Bogota', tax: { shortName: 'IVA', fullName: 'Impuesto sobre las Ventas', defaultRate: 19, businessIdLabel: 'NIT', personalIdLabel: 'Cédula', customerIdLabel: 'NIT / Cédula', fiscalDocumentLabel: 'CUFE', fiscalDocumentsLabel: 'Documentos fiscales', taxAuthority: 'DIAN', electronicProviderEnabled: false } },
  CL: { country: 'CL', language: 'es', locale: 'es-CL', currency: 'CLP', currencySymbol: '$', dateFormat: 'DD/MM/YYYY', timeZone: 'America/Santiago', tax: { shortName: 'IVA', fullName: 'Impuesto al Valor Agregado', defaultRate: 19, businessIdLabel: 'RUT', personalIdLabel: 'RUT', customerIdLabel: 'RUT', fiscalDocumentLabel: 'Folio fiscal', fiscalDocumentsLabel: 'Documentos tributarios', taxAuthority: 'SII', electronicProviderEnabled: false } },
  PE: { country: 'PE', language: 'es', locale: 'es-PE', currency: 'PEN', currencySymbol: 'S/', dateFormat: 'DD/MM/YYYY', timeZone: 'America/Lima', tax: { shortName: 'IGV', fullName: 'Impuesto General a las Ventas', defaultRate: 18, businessIdLabel: 'RUC', personalIdLabel: 'DNI', customerIdLabel: 'RUC / DNI', fiscalDocumentLabel: 'Documento fiscal', fiscalDocumentsLabel: 'Comprobantes de pago', taxAuthority: 'SUNAT', electronicProviderEnabled: false } },
  PA: { country: 'PA', language: 'es', locale: 'es-PA', currency: 'PAB', currencySymbol: 'B/.', dateFormat: 'DD/MM/YYYY', timeZone: 'America/Panama', tax: { shortName: 'ITBMS', fullName: 'Impuesto a la Transferencia de Bienes Muebles y Servicios', defaultRate: 7, businessIdLabel: 'RUC', personalIdLabel: 'Cédula', customerIdLabel: 'RUC / Cédula', fiscalDocumentLabel: 'Documento fiscal', fiscalDocumentsLabel: 'Documentos fiscales', taxAuthority: 'DGI', electronicProviderEnabled: false } },
  CR: { country: 'CR', language: 'es', locale: 'es-CR', currency: 'CRC', currencySymbol: '₡', dateFormat: 'DD/MM/YYYY', timeZone: 'America/Costa_Rica', tax: { shortName: 'IVA', fullName: 'Impuesto al Valor Agregado', defaultRate: 13, businessIdLabel: 'Cédula jurídica', personalIdLabel: 'Cédula', customerIdLabel: 'Identificación fiscal', fiscalDocumentLabel: 'Clave numérica', fiscalDocumentsLabel: 'Comprobantes electrónicos', taxAuthority: 'Hacienda', electronicProviderEnabled: false } },
  GT: { country: 'GT', language: 'es', locale: 'es-GT', currency: 'GTQ', currencySymbol: 'Q', dateFormat: 'DD/MM/YYYY', timeZone: 'America/Guatemala', tax: { shortName: 'IVA', fullName: 'Impuesto al Valor Agregado', defaultRate: 12, businessIdLabel: 'NIT', personalIdLabel: 'DPI', customerIdLabel: 'NIT / DPI', fiscalDocumentLabel: 'Autorización fiscal', fiscalDocumentsLabel: 'Documentos tributarios', taxAuthority: 'SAT', electronicProviderEnabled: false } },
  PR: { country: 'PR', language: 'es', locale: 'es-PR', currency: 'USD', currencySymbol: '$', dateFormat: 'MM/DD/YYYY', timeZone: 'America/Puerto_Rico', tax: { shortName: 'IVU', fullName: 'Impuesto sobre Ventas y Uso', defaultRate: 11.5, businessIdLabel: 'EIN', personalIdLabel: 'ID', customerIdLabel: 'Identificación fiscal', fiscalDocumentLabel: 'Documento fiscal', fiscalDocumentsLabel: 'Documentos fiscales', taxAuthority: 'Hacienda', electronicProviderEnabled: false } },
}

export function getLocaleProfile(country = localStorage.getItem('sistema_pais') || 'DO'): LocaleProfile {
  const base = localeProfiles[country] || localeProfiles.DO
  const customName = localStorage.getItem('sistema_impuesto_nombre') || ''
  const customFullName = localStorage.getItem('sistema_impuesto_nombre_completo') || ''
  const customRate = Number(localStorage.getItem('sistema_impuesto_porcentaje'))
  return {
    ...base,
    tax: {
      ...base.tax,
      shortName: customName || base.tax.shortName,
      fullName: customFullName || customName || base.tax.fullName,
      defaultRate: Number.isFinite(customRate) && customRate >= 0 ? customRate : base.tax.defaultRate,
    },
  }
}

export function getTaxName(country?: string): string {
  return getLocaleProfile(country).tax.shortName
}

export function getFiscalLabels(country?: string): TaxProfile {
  return getLocaleProfile(country).tax
}

/** Uses the active country's ISO currency code so "$" is never ambiguous. */
export function formatSystemCurrency(value: unknown, options: Intl.NumberFormatOptions = {}): string {
  const profile = getLocaleProfile()
  const amount = Number(value)
  return new Intl.NumberFormat(profile.locale, {
    style: 'currency',
    currency: profile.currency,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(Number.isFinite(amount) ? amount : 0)
}

export function getSystemCurrencyCode(): string {
  return getLocaleProfile().currency
}

export function getSystemLocale(): string {
  return getLocaleProfile().locale
}

export function formatSystemNumber(value: unknown, options: Intl.NumberFormatOptions = {}): string {
  const amount = Number(value)
  return new Intl.NumberFormat(getSystemLocale(), options).format(Number.isFinite(amount) ? amount : 0)
}

export function formatSystemDate(value: Date | string | number, options: Intl.DateTimeFormatOptions = {}): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value ?? '')
  const profile = getLocaleProfile()
  return new Intl.DateTimeFormat(profile.locale, { timeZone: profile.timeZone, ...options }).format(date)
}

export function formatSystemDateTime(value: Date | string | number, options: Intl.DateTimeFormatOptions = {}): string {
  const hasExplicitParts = ['weekday', 'era', 'year', 'month', 'day', 'dayPeriod', 'hour', 'minute', 'second', 'fractionalSecondDigits', 'timeZoneName']
    .some(key => options[key as keyof Intl.DateTimeFormatOptions] !== undefined)
  if (hasExplicitParts) return formatSystemDate(value, options)
  return formatSystemDate(value, {
    dateStyle: 'short',
    timeStyle: 'short',
    ...options,
  })
}
