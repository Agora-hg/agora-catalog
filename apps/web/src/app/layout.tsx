import { ClientRuntime } from '@/components/ClientRuntime'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { YandexMetrika } from '@/components/YandexMetrika'
import { getPublicApiUrl } from '@/lib/config'
import { defaultMetadata } from '@/lib/seo'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

/**
 * Inter с кириллицей.
 *
 * Генератор дизайн-системы предлагал Plus Jakarta Sans, но у неё нет кириллицы,
 * а весь текст каталога русский — заголовки поехали бы на системный шрифт.
 * Inter даёт ту же деловую нейтральность и полный кириллический набор.
 * display: swap — чтобы текст был виден сразу, это же и для SEO важно.
 */
const inter = Inter({
  subsets: ['cyrillic', 'latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const revalidate = 900
export const runtime = 'nodejs'

export const metadata: Metadata = defaultMetadata()

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable}>
      <body>
        <Header />
        <main id="content" className="main">
          <div className="wrap">{children}</div>
        </main>
        <Footer />
        <ClientRuntime apiUrl={getPublicApiUrl()} path="" />
        <YandexMetrika />
      </body>
    </html>
  )
}
