import type { AnalyticsReport, NamedCount } from '../events/report.js'
import type { AdminUser } from './session.js'

function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const CSS = `
:root { font-family: Arial, sans-serif; font-size: 15px; color: #111; }
body { margin: 0; background: #f3f3f3; }
a { color: #0b57d0; }
header { background: #1b1b1b; color: #fff; padding: 10px 16px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
header a { color: #fff; text-decoration: none; padding: 4px 8px; border-radius: 4px; }
header a.active { background: #fff; color: #111; font-weight: 700; }
header .brand { font-weight: 700; margin-right: 8px; }
header .right { margin-left: auto; display: flex; gap: 12px; align-items: center; }
main { padding: 16px; max-width: 1100px; }
h1 { margin: 0 0 8px; font-size: 22px; }
h2 { margin: 0 0 10px; font-size: 18px; }
.lead { color: #444; margin: 0 0 16px; }
.tabs { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 16px; }
.tabs a { background: #fff; border: 1px solid #bbb; padding: 6px 10px; text-decoration: none; color: #111; border-radius: 4px; }
.tabs a.active { background: #1b1b1b; color: #fff; border-color: #1b1b1b; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 0 0 16px; }
@media (max-width: 800px) { .grid { grid-template-columns: 1fr 1fr; } }
.stat { background: #fff; border: 1px solid #ccc; padding: 12px 14px; }
.stat b { display: block; font-size: 28px; }
.card { background: #fff; border: 1px solid #ccc; padding: 12px 14px; margin: 0 0 14px; }
.gold { border-color: #c9a227; background: #fff8e1; }
table { width: 100%; border-collapse: collapse; background: #fff; }
th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
.muted { color: #666; font-size: 13px; }
.funnel { display: flex; gap: 8px; flex-wrap: wrap; align-items: stretch; margin: 0 0 8px; }
.funnel .step { flex: 1; min-width: 140px; background: #fff; border: 1px solid #ccc; padding: 10px; }
.login { max-width: 360px; margin: 12vh auto; background: #fff; padding: 24px; border: 1px solid #ccc; }
label { display: block; margin: 8px 0 4px; font-weight: 700; }
input { width: 100%; box-sizing: border-box; padding: 8px; font-size: 15px; }
button { font-size: 14px; padding: 8px 12px; cursor: pointer; }
.error { background: #f8d0d0; padding: 10px; margin: 0 0 12px; }
`

function layout(opts: { title: string; user: AdminUser | null; body: string; active?: boolean }): string {
  const nav =
    opts.user === null
      ? ''
      : `<header>
  <span class="brand">Агора</span>
  <a href="/admin">Обзвон</a>
  <a href="/admin/analytics" class="${opts.active ? 'active' : ''}">Аналитика</a>
  <div class="right">
    <span>${esc(opts.user.email)}</span>
    <form method="post" action="/admin/auth/logout"><button type="submit">Выйти</button></form>
  </div>
</header>`
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(opts.title)}</title>
  <style>${CSS}</style>
</head>
<body>
${nav}
<main>
${opts.body}
</main>
</body>
</html>`
}

export function loginPage(error?: string): string {
  return layout({
    title: 'Вход — Агора',
    user: null,
    body: `<div class="login">
  <h1>Операторская панель</h1>
  ${error ? `<div class="error">${esc(error)}</div>` : ''}
  <form method="post" action="/admin/auth/login">
    <label>Email</label>
    <input type="email" name="email" required autocomplete="username">
    <label>Пароль</label>
    <input type="password" name="password" required autocomplete="current-password">
    <p><button type="submit">Войти</button></p>
  </form>
</div>`,
  })
}

function table(rows: NamedCount[], empty: string): string {
  if (rows.length === 0) return `<p class="muted">${esc(empty)}</p>`
  const body = rows
    .map(
      (row, i) =>
        `<tr><td>${i + 1}</td><td>${esc(row.label)}</td><td>${row.count}</td><td>${row.visitors}</td></tr>`,
    )
    .join('')
  return `<table>
  <thead><tr><th>#</th><th></th><th>событий</th><th>посетителей</th></tr></thead>
  <tbody>${body}</tbody>
</table>`
}

export function analyticsPage(opts: { user: AdminUser; report: AnalyticsReport }): string {
  const r = opts.report
  const f = r.funnel
  const tab = (days: number, label: string) =>
    `<a href="/admin/analytics?days=${days}" class="${r.range.days === days ? 'active' : ''}">${label}</a>`
  return layout({
    title: 'Аналитика поведения — Агора',
    user: opts.user,
    active: true,
    body: `<h1>Аналитика поведения</h1>
<p class="lead">Не счётчик визитов: какие карточки смотрят (лист для продаж) и какие запросы ничего не находят (дыры каталога).</p>
<div class="tabs">${tab(7, '7 дней')}${tab(30, '30 дней')}${tab(90, '90 дней')}</div>
<div class="grid">
  <div class="stat"><span>Посетители</span><b>${r.visitors}</b></div>
  <div class="stat"><span>Сессии</span><b>${r.sessions}</b></div>
  <div class="stat"><span>Переходы на сайт</span><b>${f.website}</b></div>
  <div class="stat"><span>Заявки</span><b>${f.requests}</b></div>
</div>
<div class="card">
  <h2>Воронка: визит → карточка → сайт или заявка</h2>
  <div class="funnel">
    <div class="step"><span>Визит</span><b>${f.visits}</b><div class="muted">сессии с page_view</div></div>
    <div class="step"><span>Карточка</span><b>${f.cards}</b><div class="muted">${f.visit_to_card_pct}% от визитов</div></div>
    <div class="step"><span>Сайт или заявка</span><b>${f.converted}</b><div class="muted">${f.visit_to_converted_pct}% от визитов · ${f.card_to_converted_pct}% от карточки</div></div>
  </div>
  <p class="muted">Сайт: ${f.website} сессий · заявка: ${f.requests} сессий. «Сконвертировались» — объединение.</p>
</div>
<div class="card gold">
  <h2>Поиски, по которым ничего не нашлось</h2>
  <p class="muted">Самое ценное в отчёте: запросы, которых нет в каталоге. Это список категорий, которых нам не хватает.</p>
  ${table(r.emptySearches, 'Пустых поисков за период нет.')}
</div>
<div class="card">
  <h2>Топ просмотренных компаний</h2>
  <p class="muted">card_view только когда карточка попала во вьюпорт, не когда отрисовалась.</p>
  ${table(r.topCompanies, 'Просмотров карточек нет.')}
</div>
<div class="card">
  <h2>Топ поисковых запросов</h2>
  ${table(r.topSearches, 'Поисков нет.')}
</div>
<div class="card">
  <h2>Топ фильтров</h2>
  ${table(r.topFilters, 'Фильтры не применяли.')}
</div>`,
  })
}
