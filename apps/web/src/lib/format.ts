/** ISO-дата API → «04.09.2026» для «Информация проверена». */
export function formatCheckedAt(iso: string | null | undefined): string {
  if (!iso) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (match) return `${match[3]}.${match[2]}.${match[1]}`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = String(date.getUTCFullYear())
  return `${dd}.${mm}.${yyyy}`
}

export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const n = Number.parseInt(raw ?? '1', 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return n
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim()
  return trimmed ? trimmed : undefined
}
