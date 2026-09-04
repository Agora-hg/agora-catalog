import type { NextConfig } from 'next'

/**
 * Портируемый фронт: переезд на московский VPS = смена DNS.
 * Никакого Edge Middleware, Vercel KV/Blob, Vercel Image Optimization.
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  images: { unoptimized: true },
  // Title/description в <head> сразу, не стримом: иначе curl и часть роботов
  // видят пустой head. SEO — смысл продукта.
  htmlLimitedBots: /./,
}

export default nextConfig
