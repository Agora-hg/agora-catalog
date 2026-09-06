import type { CompanyDetail } from '@/lib/types'

export function Requisites({ company }: { company: CompanyDetail }) {
  const rows: { label: string; value: string }[] = []
  if (company.legal_name) rows.push({ label: 'Юридическое лицо', value: company.legal_name })
  if (company.inn) rows.push({ label: 'ИНН', value: company.inn })
  if (company.ogrn) rows.push({ label: 'ОГРН', value: company.ogrn })
  if (company.okved) rows.push({ label: 'ОКВЭД', value: company.okved })
  if (company.address) rows.push({ label: 'Юридический адрес', value: company.address })
  if (company.phone) rows.push({ label: 'Телефон', value: company.phone })
  if (company.hours_raw) rows.push({ label: 'Часы работы', value: company.hours_raw })
  if (rows.length === 0) return null

  return (
    <dl className="requisites">
      {rows.map((row) => (
        <div key={row.label} style={{ display: 'contents' }}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
