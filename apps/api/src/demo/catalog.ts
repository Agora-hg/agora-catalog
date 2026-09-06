/** Фикстура для приёмки IntersectionObserver: 3 карточки в первом экране, остальные ниже сгиба. */
export function catalogFixturePage(): string {
  const cards = Array.from({ length: 24 }, (_, i) => {
    const n = i + 1
    const name = n <= 3 ? `Видимая ${n}` : `Ниже сгиба ${n}`
    const slug = n <= 3 ? `visible-${n}` : `below-${n}`
    return `<article class="card" data-card-slug="${slug}" data-analytics-company="${slug}" style="min-height:280px">
  <h2>${name}</h2>
  <p>Поставщик упаковки №${n}</p>
  <p>
    <a href="/company/${slug}" data-analytics="card_expand" data-slug="${slug}">Подробнее</a>
    <a href="https://example.test/${slug}" data-analytics="website_click" data-slug="${slug}" target="_blank" rel="noreferrer">Сайт</a>
  </p>
</article>`
  }).join('\n')

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Каталог — фикстура аналитики</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; }
    .wrap { max-width: 720px; margin: 0 auto; padding: 16px; }
    .card { border: 1px solid #ccc; padding: 16px; margin: 0 0 16px; background: #fff; }
    .search { display: flex; gap: 8px; margin: 0 0 16px; }
    input { flex: 1; padding: 8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Каталог поставщиков упаковки</h1>
    <form class="search" action="/search" method="get">
      <input type="search" name="q" placeholder="Компании и упаковка">
      <button type="submit">Найти</button>
    </form>
    <div class="cards">${cards}</div>
  </div>
  <script>
    window.__AGORA_API__ = location.origin + '/v1';
  </script>
  <script type="module">
    const apiUrl = window.__AGORA_API__;
    const VISITOR_KEY = 'agora_vid';
    const SESSION_KEY = 'agora_sid';
    const SESSION_TTL_MS = 30 * 60 * 1000;
    const BUFFER_KEY = 'agora_evt_buf';
    function uuid() { return crypto.randomUUID(); }
    function readCookie(name) {
      const parts = document.cookie.split(';');
      for (const part of parts) {
        const [k, ...rest] = part.trim().split('=');
        if (k === name) return decodeURIComponent(rest.join('='));
      }
    }
    function writeCookie(name, value, maxAgeSec) {
      document.cookie = name + '=' + encodeURIComponent(value) + '; Max-Age=' + maxAgeSec + '; Path=/; SameSite=Lax';
    }
    function visitorId() {
      let id = readCookie(VISITOR_KEY);
      if (!id) { id = uuid(); }
      writeCookie(VISITOR_KEY, id, 365 * 24 * 3600);
      return id;
    }
    function sessionId() {
      const now = Date.now();
      const raw = readCookie(SESSION_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (now - parsed.at < SESSION_TTL_MS) {
            const next = JSON.stringify({ id: parsed.id, at: now });
            writeCookie(SESSION_KEY, next, 30 * 60);
            return parsed.id;
          }
        } catch (e) {}
      }
      const id = uuid();
      writeCookie(SESSION_KEY, JSON.stringify({ id, at: now }), 30 * 60);
      return id;
    }
    const buffer = [];
    try { const saved = JSON.parse(sessionStorage.getItem(BUFFER_KEY) || '[]'); if (Array.isArray(saved)) buffer.push(...saved); } catch (e) {}
    const vid = visitorId();
    const sid = sessionId();
    const viewed = new Set();
    function persist() { sessionStorage.setItem(BUFFER_KEY, JSON.stringify(buffer)); }
    function flush() {
      if (!buffer.length) return;
      const batch = buffer.splice(0, 50);
      persist();
      const body = JSON.stringify(batch);
      const url = apiUrl + '/events';
      const blob = new Blob([body], { type: 'text/plain' });
      if (!navigator.sendBeacon || !navigator.sendBeacon(url, blob)) {
        fetch(url, { method: 'POST', body, headers: { 'content-type': 'text/plain' }, keepalive: true });
      }
    }
    function track(event, extra) {
      buffer.push({
        visitor_id: vid,
        session_id: sid,
        event,
        path: location.pathname + location.search,
        referrer: document.referrer || '',
        payload: extra || undefined,
      });
      persist();
      if (buffer.length >= 50) flush();
    }
    track('page_view');
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-analytics]');
      if (!el) return;
      const name = el.getAttribute('data-analytics');
      const slug = el.getAttribute('data-slug');
      if (name) track(name, slug ? { slug } : undefined);
    });
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
        const slug = entry.target.getAttribute('data-card-slug');
        if (!slug || viewed.has(slug)) continue;
        viewed.add(slug);
        track('card_view', { slug });
        io.unobserve(entry.target);
      }
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-card-slug]').forEach((n) => io.observe(n));
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    setInterval(flush, 2000);
  </script>
</body>
</html>`
}
