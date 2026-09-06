const urls = ['/', '/company/alinapak', '/category/gofrokoroba/moskva']
for (const path of urls) {
  const html = await (await fetch('http://localhost:3012' + path)).text()
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) =>
    JSON.parse(m[1]),
  )
  console.log('\n==', path, 'json-ld', blocks.length, '==')
  for (const b of blocks) {
    const t = b['@type']
    console.log(Array.isArray(t) ? t.join(',') : t, b.name || b.itemListElement?.[0]?.name || '')
  }
}
const robots = await (await fetch('http://localhost:3012/robots.txt')).text()
console.log('\n== robots.txt ==\n' + robots)
const sm = await (await fetch('http://localhost:3012/sitemap.xml')).text()
console.log('sitemap urls', (sm.match(/<loc>/g) || []).length)
