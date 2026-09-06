import { ClientRuntime } from '@/components/ClientRuntime'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { getPublicApiUrl } from '@/lib/config'
import { defaultMetadata } from '@/lib/seo'
import type { Metadata } from 'next'
import './globals.css'

export const revalidate = 900
export const runtime = 'nodejs'

export const metadata: Metadata = defaultMetadata()

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Header />
        <main id="content" className="main">
          <div className="wrap">{children}</div>
        </main>
        <Footer />
        <ClientRuntime apiUrl={getPublicApiUrl()} path="" />
      </body>
    </html>
  )
}
