function text(value: any): string {
  return String(value ?? '').trim()
}

function normalizedName(value: any): string {
  return text(value).toLocaleUpperCase()
}

export function sameWarehouse(imei: any, phone: any): boolean {
  const imeiUid = text(imei?.almacen_uid)
  const phoneUid = text(phone?.almacen_uid)
  if (imeiUid && phoneUid) return imeiUid === phoneUid

  const imeiId = text(imei?.almacen_id)
  const phoneId = text(phone?.almacen_id)
  if (imeiId && phoneId) return imeiId === phoneId

  // Registros antiguos pueden no tener uno de los dos identificadores.
  return true
}

/**
 * Reconoce relaciones nuevas y antiguas entre IMEI y telefono.
 * En algunas sincronizaciones web el UID del telefono quedo en id_equi.
 */
export function imeiBelongsToPhone(imei: any, phone: any): boolean {
  if (!imei || !phone) return false

  const phoneUid = text(phone.uid)
  const phoneId = text(phone.id)
  const telefonoUid = text(imei.telefono_uid)
  const legacyReference = text(imei.id_equi)

  if (phoneUid && (telefonoUid === phoneUid || legacyReference === phoneUid)) return true
  if (phoneId && legacyReference === phoneId && sameWarehouse(imei, phone)) return true

  const imeiPhoneName = normalizedName(imei.equipo || imei.telefono_nombre)
  const phoneName = normalizedName(phone.nombre)
  return Boolean(imeiPhoneName && phoneName && imeiPhoneName === phoneName && sameWarehouse(imei, phone))
}

export function resolvePhoneForImei(imei: any, phones: any[]): any | null {
  if (!imei || !Array.isArray(phones)) return null

  const telefonoUid = text(imei.telefono_uid)
  const legacyReference = text(imei.id_equi)

  const exactUid = phones.find(phone => {
    const uid = text(phone?.uid)
    return uid && (uid === telefonoUid || uid === legacyReference) && sameWarehouse(imei, phone)
  })
  if (exactUid) return exactUid

  const exactId = phones.find(phone => text(phone?.id) === legacyReference && sameWarehouse(imei, phone))
  if (exactId) return exactId

  const byName = phones.find(phone => imeiBelongsToPhone(imei, phone))
  if (byName) return byName

  // Ultimo respaldo para datos sin almacen: el UID sigue siendo globalmente estable.
  return phones.find(phone => {
    const uid = text(phone?.uid)
    return uid && (uid === telefonoUid || uid === legacyReference)
  }) || null
}
