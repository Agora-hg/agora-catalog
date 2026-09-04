import { RequestForm } from '@/components/RequestForm'
import { requestsMeta } from '@/lib/seo'
import type { Metadata } from 'next'

export const revalidate = 900
export const runtime = 'nodejs'

export const metadata: Metadata = requestsMeta()

export default function RequestsPage() {
  return (
    <article className="stub">
      <h1 className="page-title">Заявки</h1>
      <div className="stub-text">
        <p>Заявок пока нет.</p>
        <p>Хотите разместить — отправьте описание запроса на почту.</p>
      </div>
      <RequestForm />
    </article>
  )
}
