import { computed, onMounted, onUnmounted, ref } from 'vue'
import { formatSystemCurrency, formatSystemDate, formatSystemDateTime, formatSystemNumber, getLocaleProfile } from '@/i18n/localeProfiles'

export function useLocaleProfile() {
  const revision = ref(0)
  const refresh = () => { revision.value++ }
  onMounted(() => window.addEventListener('system-locale-changed', refresh))
  onUnmounted(() => window.removeEventListener('system-locale-changed', refresh))

  const profile = computed(() => {
    revision.value
    return getLocaleProfile()
  })

  return {
    profile,
    taxName: computed(() => profile.value.tax.shortName),
    taxFullName: computed(() => profile.value.tax.fullName),
    fiscal: computed(() => profile.value.tax),
    country: computed(() => profile.value.country),
    isDominicanFiscal: computed(() => profile.value.tax.electronicProviderEnabled),
    currency: computed(() => profile.value.currency),
    // Expose the ISO code in monetary UI; symbols such as "$" are ambiguous.
    currencySymbol: computed(() => profile.value.currency),
    locale: computed(() => profile.value.locale),
    formatCurrency: formatSystemCurrency,
    formatNumber: formatSystemNumber,
    formatDate: formatSystemDate,
    formatDateTime: formatSystemDateTime,
  }
}
