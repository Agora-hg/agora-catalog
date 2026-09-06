import type { adminUsers, requestCompanies, requests, supplierResponses } from '@agora/db'
import type { Funnel } from './funnel.ts'
import { RC_STATUSES, REQUEST_STATUSES } from './requests.ts'
import { formatMoscow, telHref } from '../http.ts'

export type AdminUser = typeof adminUsers.$inferSelect
export type NavId = 'requests' | 'funnel' | 'login'

export type NavCounts = { requests: number }

export function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function attr(value: string | number | null | undefined): string {
  return esc(value)
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
main { padding: 16px; max-width: 1200px; }
h1 { margin: 0 0 12px; font-size: 22px; }
.tabs { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 14px; }
.tabs a { background: #fff; border: 1px solid #bbb; padding: 6px 10px; text-decoration: none; color: #111; border-radius: 4px; }
.tabs a.active { background: #1b1b1b; color: #fff; border-color: #1b1b1b; }
button, .btn { font-size: 14px; padding: 8px 12px; cursor: pointer; border: 1px solid #888; background: #fff; border-radius: 4px; }
.btn-primary { background: #0b57d0; color: #fff; border-color: #0b57d0; }
.card { background: #fff; border: 1px solid #ccc; padding: 12px 14px; margin: 0 0 10px; }
label { display: block; margin: 8px 0 4px; font-weight: 700; }
input[type=text], input[type=email], input[type=password], textarea, select {
  width: 100%; box-sizing: border-box; padding: 8px; font-size: 15px; font-family: inherit;
}
textarea { min-height: 80px; }
.error { background: #f8d0d0; padding: 10px; margin: 0 0 12px; }
.ok { background: #d4edda; padding: 10px; margin: 0 0 12px; }
table { width: 100%; border-collapse: collapse; background: #fff; }
th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
.muted { color: #666; font-size: 13px; }
.pager { margin: 16px 0; display: flex; gap: 8px; }
.login { max-width: 360px; margin: 12vh auto; background: #fff; padding: 24px; border: 1px solid #ccc; }
.funnel { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
.funnel .step { background: #fff; border: 1px solid #ccc; padding: 16px 20px; min-width: 140px; }
.funnel .n { font-size: 32px; font-weight: 700; }
.pii { background: #fff6d5; padding: 10px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; }
.actions form { margin: 0; }
`

export function layout(opts: {
  title: string
  user: AdminUser | null
  active: NavId
  counts?: NavCounts
  body: string
}): string {
  const counts = opts.counts
  const nav =
    opts.user === null
      ? ''
      : `<header>
  <span class="brand">Агора</span>
  <a href="/admin/requests" class="${opts.active === 'requests' ? 'active' : ''}">Заявки${counts ? ` (${counts.requests})` : ''}</a>
  <a href="/admin/stats/funnel" class="${opts.active === 'funnel' ? 'active' : ''}">Воронка</a>
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
    active: 'login',
    body: `<div class="login">
  <h1>Операторская панель</h1>
  ${error ? `<div class="error">${esc(error)}</div>` : ''}
  <form method="post" action="/admin/auth/login">
    <label>Email</label>
    <input type="email" name="email" required autocomplete="username">
    <label>Пароль</label>
    <input type="password" name="password" required autocomplete="current-password">
    <p><button class="btn-primary" type="submit">Войти</button></p>
  </form>
</div>`,
  })
}

export function thanksPage(title: string, text: string): string {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <style>body{font-family:Arial,sans-serif;max-width:40rem;margin:12vh auto;padding:0 16px}</style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p>${esc(text)}</p>
</body>
</html>`
}

function pager(base: string, page: number, total: number, perPage: number): string {
  const pages = Math.max(1, Math.ceil(total / perPage))
  if (pages <= 1) return ''
  const sep = base.includes('?') ? '&' : '?'
  const prev = page > 1 ? `<a href="${attr(base + sep + 'page=' + (page - 1))}">← назад</a>` : ''
  const next = page < pages ? `<a href="${attr(base + sep + 'page=' + (page + 1))}">вперёд →</a>` : ''
  return `<div class="pager">${prev}<span>стр. ${page} из ${pages}</span>${next}</div>`
}

const STATUS_LABEL: Record<string, string> = {
  new: 'новая',
  processing: 'в работе',
  suppliers_found: 'поставщики подобраны',
  sent_to_suppliers: 'отправлено поставщикам',
  supplier_interested: 'поставщик заинтересован',
  completed: 'закрыта',
  cancelled: 'отменена',
  selected: 'выбран',
  contacted: 'связались',
  no_answer: 'не ответил',
  interested: 'заинтересован',
  not_interested: 'отказался',
  connected: 'дошёл до клиента',
}

export function requestsPage(opts: {
  user: AdminUser
  counts: NavCounts
  items: (typeof requests.$inferSelect)[]
  status: string
  total: number
  page: number
  perPage: number
  notice?: string
  error?: string
}): string {
  const tab = (id: string, label: string) =>
    `<a href="/admin/requests${id ? `?status=${attr(id)}` : ''}" class="${opts.status === id ? 'active' : ''}">${label}</a>`
  const rows = opts.items
    .map(
      (r) => `<tr>
  <td><a href="/admin/requests/${attr(r.id)}">${esc(STATUS_LABEL[r.status] ?? r.status)}</a></td>
  <td>${esc(r.customerName)}</td>
  <td>${r.customerPhone ? `<a href="${attr(telHref(r.customerPhone))}">${esc(r.customerPhone)}</a>` : esc(r.customerEmail)}</td>
  <td>${esc((r.description ?? '').slice(0, 140))}</td>
  <td>${esc(formatMoscow(r.createdAt))}</td>
</tr>`,
    )
    .join('')
  const base = opts.status ? `/admin/requests?status=${encodeURIComponent(opts.status)}` : '/admin/requests'
  return layout({
    title: 'Заявки — Агора',
    user: opts.user,
    active: 'requests',
    counts: opts.counts,
    body: `<h1>Заявки</h1>
${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ''}
${opts.notice ? `<div class="ok">${esc(opts.notice)}</div>` : ''}
<div class="tabs">
  ${tab('', 'Все')}
  ${REQUEST_STATUSES.map((s) => tab(s, STATUS_LABEL[s] ?? s)).join('\n  ')}
</div>
<table>
  <thead><tr><th>Статус</th><th>Кто</th><th>Контакт</th><th>Что нужно</th><th>Когда</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="5">Заявок нет</td></tr>`}</tbody>
</table>
${pager(base, opts.page, opts.total, opts.perPage)}`,
  })
}

export function requestPage(opts: {
  user: AdminUser
  counts: NavCounts
  request: typeof requests.$inferSelect
  attached: {
    rc: typeof requestCompanies.$inferSelect
    companyName: string
    companySlug: string
    companyPhone: string | null
  }[]
  responses: (typeof supplierResponses.$inferSelect)[]
  search: { id: string; name: string; slug: string; phone: string | null; city: string | null }[]
  q: string
  notice?: string
  error?: string
}): string {
  const r = opts.request
  const statusOpts = REQUEST_STATUSES.map(
    (s) => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${esc(STATUS_LABEL[s] ?? s)}</option>`,
  ).join('')
  const rcRows = opts.attached
    .map(({ rc, companyName, companyPhone }) => {
      const optsHtml = RC_STATUSES.map(
        (s) => `<option value="${s}" ${rc.status === s ? 'selected' : ''}>${esc(STATUS_LABEL[s] ?? s)}</option>`,
      ).join('')
      return `<tr>
  <td>${esc(companyName)}<div class="muted">${companyPhone ? esc(companyPhone) : 'нет телефона'}</div></td>
  <td>
    <form method="post" action="/admin/request-companies/${attr(rc.id)}">
      <select name="status">${optsHtml}</select>
      <input type="text" name="comment" value="${attr(rc.comment)}" placeholder="комментарий">
      <button type="submit">Сохранить</button>
    </form>
  </td>
</tr>`
    })
    .join('')
  const searchRows = opts.search
    .map(
      (c) => `<tr>
  <td>${esc(c.name)} <span class="muted">${esc(c.city)}</span></td>
  <td>${esc(c.phone)}</td>
  <td>
    <form method="post" action="/admin/requests/${attr(r.id)}/companies">
      <input type="hidden" name="company_ids" value="${attr(c.id)}">
      <button class="btn-primary" type="submit">Добавить</button>
    </form>
  </td>
</tr>`,
    )
    .join('')
  const responses = opts.responses
    .map(
      (s) => `<div class="card">
  <p><b>${esc(s.companyName || s.name || 'поставщик')}</b> · ${esc(s.phone)} · ${esc(s.email)} · ${esc(s.status)}</p>
  <p>${esc(s.message)}</p>
  <p class="muted">${esc(formatMoscow(s.createdAt))}</p>
</div>`,
    )
    .join('')
  return layout({
    title: `Заявка — Агора`,
    user: opts.user,
    active: 'requests',
    counts: opts.counts,
    body: `<p><a href="/admin/requests">← к заявкам</a></p>
<h1>Заявка</h1>
${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ''}
${opts.notice ? `<div class="ok">${esc(opts.notice)}</div>` : ''}
<div class="card pii">
  <p><b>${esc(r.customerName) || 'без имени'}</b></p>
  <p>Телефон: ${r.customerPhone ? `<a href="${attr(telHref(r.customerPhone))}">${esc(r.customerPhone)}</a>` : '—'}</p>
  <p>Почта: ${esc(r.customerEmail) || '—'}</p>
  <p>Город: ${esc(r.deliveryCity)} · кол-во: ${esc(r.quantity)} · срок: ${esc(r.deadline)}</p>
  <p>${esc(r.description)}</p>
  <p class="muted">${esc(formatMoscow(r.createdAt))}</p>
</div>
<form method="post" action="/admin/requests/${attr(r.id)}" class="card">
  <label>Статус</label>
  <select name="status">${statusOpts}</select>
  <label>Внутренняя заметка</label>
  <textarea name="internal_note">${esc(r.internalNote)}</textarea>
  <p><button class="btn-primary" type="submit">Сохранить заявку</button></p>
</form>
<h2>Поставщики по заявке</h2>
<table>
  <thead><tr><th>Компания</th><th>Статус контакта</th></tr></thead>
  <tbody>${rcRows || `<tr><td colspan="2">Ещё никого не подобрали</td></tr>`}</tbody>
</table>
<div class="card">
  <h2>Подобрать компанию</h2>
  <form method="get" action="/admin/requests/${attr(r.id)}">
    <input type="text" name="q" value="${attr(opts.q)}" placeholder="имя, slug, телефон">
    <p><button type="submit">Найти</button></p>
  </form>
  ${opts.q ? `<table><thead><tr><th>Компания</th><th>Телефон</th><th></th></tr></thead><tbody>${searchRows || `<tr><td colspan="3">Никого не нашли</td></tr>`}</tbody></table>` : ''}
</div>
<h2>Отклики поставщиков</h2>
${responses || '<p class="muted">Откликов нет.</p>'}`,
  })
}

export function funnelPage(opts: { user: AdminUser; counts: NavCounts; funnel: Funnel }): string {
  const f = opts.funnel
  const step = (n: number, label: string) =>
    `<div class="step"><div class="n">${n}</div><div>${esc(label)}</div></div>`
  return layout({
    title: 'Воронка — Агора',
    user: opts.user,
    active: 'funnel',
    counts: opts.counts,
    body: `<h1>Воронка</h1>
<p class="muted">Считается по таблице request_companies. Это единственная бизнес-метрика V0.</p>
<div class="funnel">
  ${step(f.requests, 'заявок')}
  ${step(f.contacts, 'контактов')}
  ${step(f.answered, 'ответили')}
  ${step(f.interested, 'заинтересовались')}
  ${step(f.connected, 'дошли до клиента')}
</div>
<p class="muted">Контакт — статус не selected (оператор уже вышел на связь). Ответили — interested / not_interested / connected. Заинтересовались — interested + connected.</p>`,
  })
}
