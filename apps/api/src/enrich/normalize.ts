/** Case, ё, quotes, extra spaces. Legal form (ООО/ИП/…) is kept on purpose. */
export function normalizeName(input: string): string {
  return input
    .normalize('NFC')
    .replace(/ё/gi, 'е')
    .toLowerCase()
    .replace(/[«»„“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeCity(input: string): string {
  let s = input.normalize('NFC').replace(/ё/gi, 'е').toLowerCase().trim()
  s = s.replace(/^(?:город|гор\.?|г\.?)\s+/, '')
  s = s.replace(/^г\./, '')
  return s.replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim()
}

export function isMoscow(city: string | null | undefined): boolean {
  const n = normalizeCity(city ?? '')
  return n === 'москва' || n === 'moscow'
}

export function cityForQuery(city: string | null | undefined): string {
  const trimmed = city?.trim()
  return trimmed ? trimmed : 'Москва'
}
