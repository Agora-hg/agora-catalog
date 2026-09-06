import type { NextConfig } from 'next'

/**
 * Портируемый фронт: переезд на московский VPS = смена DNS.
 * Никакого Edge Middleware, Vercel KV/Blob, Vercel Image Optimization.
 */
const selfHosted = process.env.SELF_HOST === '1'

const nextConfig: NextConfig = {
  /**
   * `standalone` только при self-hosting.
   *
   * На Vercel этот режим ломает функцию целиком: падало ВСЁ, включая /robots.txt,
   * который в API не ходит и данных не требует — FUNCTION_INVOCATION_FAILED
   * на каждом маршруте. Vercel собирает свой рантайм сам, и standalone-раскладка
   * ему мешает. Для переезда на VPS ставим SELF_HOST=1 и получаем ту же сборку,
   * что была раньше, — портируемость не теряется.
   */
  ...(selfHosted ? { output: 'standalone' as const } : {}),
  poweredByHeader: false,
  images: { unoptimized: true },
  // Title/description в <head> сразу, не стримом: иначе curl и часть роботов
  // видят пустой head. SEO — смысл продукта.
  htmlLimitedBots: /./,
  async headers() {
    const indexable = process.env.PUBLIC_INDEXABLE === 'true' || process.env.PUBLIC_INDEXABLE === '1'
    if (!indexable) {
      return [
        {
          source: '/:path*',
          headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
        },
      ]
    }
    return []
  },
}

export default nextConfig
