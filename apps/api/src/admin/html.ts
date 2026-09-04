import type { adminUsers, categories, companies, companyClaims, companySources } from '@agora/db'
import { formatMoscow, telHref } from '../http.ts'
import type { DadataSuggestion } from './dadata.ts'

export type AdminUser = typeof adminUsers.$inferSelect
export type NavId = 'call' | 'deleted' | 'claims' | 'dadata' | 'categories'

export type NavCounts = {
  uncalled: number
  deleted: number
  claims: number
  dadata: number
}

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
.search { display: flex; gap: 8px; margin: 0 0 14px; }
.search input { flex: 1; min-width: 180px; padding: 8px; font-size: 15px; }
button, .btn { font-size: 14px; padding: 8px 12px; cursor: pointer; border: 1px solid #888; background: #fff; border-radius: 4px; }
.btn-primary { background: #0b57d0; color: #fff; border-color: #0b57d0; }
.danger { background: #b00020; color: #fff; border-color: #b00020; }
.card { background: #fff; border: 1px solid #ccc; padding: 12px 14px; margin: 0 0 10px; }
.card h2 { margin: 0 0 6px; font-size: 18px; }
.row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
.phone { font-size: 20px; font-weight: 700; }
.meta { color: #444; }
.raw { background: #f6f1d8; padding: 8px 10px; margin: 8px 0; white-space: pre-wrap; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; margin-top: 8px; }
.actions form { margin: 0; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.badge { display: inline-block; background: #eee; padding: 2px 6px; margin-right: 6px; font-size: 12px; }
.badge.dead { background: #f8d0d0; }
.badge.ok { background: #d4edda; }
label { display: block; margin: 8px 0 4px; font-weight: 700; }
input[type=text], input[type=email], input[type=password], input[type=number], textarea, select {
  width: 100%; box-sizing: border-box; padding: 8px; font-size: 15px; font-family: inherit;
}
textarea { min-height: 80px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
@media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
.error { background: #f8d0d0; padding: 10px; margin: 0 0 12px; }
.ok { background: #d4edda; padding: 10px; margin: 0 0 12px; }
table { width: 100%; border-collapse: collapse; background: #fff; }
th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
.readonly { background: #eee; padding: 8px; }
dialog { border: 1px solid #333; padding: 16px; width: min(480px, 90vw); }
.muted { color: #666; font-size: 13px; }
.pager { margin: 16px 0; display: flex; gap: 8px; }
.login { max-width: 360px; margin: 12vh auto; background: #fff; padding: 24px; border: 1px solid #ccc; }
.cats { columns: 2; }
@media (max-width: 800px) { .cats { columns: 1; } }
.cats label { font-weight: 400; }
`

export function layout(opts: {
  title: string
  user: AdminUser | null
  active: NavId | 'login'
  counts?: NavCounts
  body: string
}): string {
  const counts = opts.counts
  const nav =
    opts.user === null
      ? ''
      : `<header>
  <span class="brand">Агора</span>
  <a href="/admin" class="${opts.active === 'call' ? 'active' : ''}">Обзвон${counts ? ` (${counts.uncalled})` : ''}</a>
  <a href="/admin/deleted" class="${opts.active === 'deleted' ? 'active' : ''}">Удалённые${counts ? ` (${counts.deleted})` : ''}</a>
  <a href="/admin/claims" class="${opts.active === 'claims' ? 'active' : ''}">Обращения${counts ? ` (${counts.claims})` : ''}</a>
  <a href="/admin/dadata" class="${opts.active === 'dadata' ? 'active' : ''}">DaData${counts ? ` (${counts.dadata})` : ''}</a>
  <a href="/admin/categories" class="${opts.active === 'categories' ? 'active' : ''}">Категории</a>
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

function pager(base: string, page: number, total: number, perPage: number): string {
  const pages = Math.max(1, Math.ceil(total / perPage))
  if (pages <= 1) return ''
  const sep = base.includes('?') ? '&' : '?'
  const prev = page > 1 ? `<a href="${attr(base + sep + 'page=' + (page - 1))}">← назад</a>` : ''
  const next = page < pages ? `<a href="${attr(base + sep + 'page=' + (page + 1))}">вперёд →</a>` : ''
  return `<div class="pager">${prev}<span>стр. ${page} из ${pages}</span>${next}</div>`
}

function deleteDialog(companyId: string): string {
  return `<button type="button" class="danger" onclick="this.nextElementSibling.showModal()">Не существует</button>
<dialog>
  <form method="post" action="/admin/companies/${attr(companyId)}/delete">
    <h3>Почему компании не существует?</h3>
    <p class="muted">Причина обязательна — из неё потом собирается статистика обзвона.</p>
    <textarea name="reason" required minlength="2" placeholder="Например: по телефону сказали, что фирмы нет"></textarea>
    <p class="actions">
      <button type="submit" class="danger">Удалить из каталога</button>
      <button type="button" onclick="this.closest('dialog').close()">Отмена</button>
    </p>
  </form>
</dialog>`
}

export function callListPage(opts: {
  user: AdminUser
  counts: NavCounts
  extraCounts: { noPhone: number; liquidated: number; alive: number }
  filter: string
  q: string
  items: (typeof companies.$inferSelect)[]
  total: number
  page: number
  perPage: number
  error?: string
  notice?: string
}): string {
  const tab = (id: string, href: string, label: string) =>
    `<a href="${attr(href)}" class="${opts.filter === id ? 'active' : ''}">${label}</a>`
  const cards = opts.items
    .map((c) => {
      const phones = [c.phone, ...(c.phones ?? [])].filter((p, i, a): p is string => Boolean(p) && a.indexOf(p) === i)
      const phoneHtml = phones.length
        ? phones.map((p) => `<div class="phone"><a href="${attr(telHref(p))}">${esc(p)}</a></div>`).join('')
        : `<div class="phone">нет телефона</div>`
      const site = c.website
        ? `<a href="${attr(c.website)}" target="_blank" rel="noreferrer">${esc(c.website)}</a>`
        : 'нет сайта'
      const egrul = c.egrulStatus
        ? `<span class="badge ${/liquidat|ликвидир/i.test(c.egrulStatus) ? 'dead' : 'ok'}">ЕГРЮЛ: ${esc(c.egrulStatus)}</span>`
        : ''
      const called = c.calledAt ? `<span class="badge">звонили ${esc(formatMoscow(c.calledAt))}</span>` : `<span class="badge">не обзвонена</span>`
      return `<article class="card">
  <div class="row">
    <div style="flex:1;min-width:240px">
      <h2><a href="/admin/companies/${attr(c.id)}">${esc(c.name)}</a></h2>
      ${phoneHtml}
      <div class="meta">${site}</div>
      <div class="meta">${esc(c.address) || 'адрес не указан'}</div>
      <div>${egrul}${called}<span class="badge">парсер: ${esc(c.status)}</span>${c.isVerified ? '<span class="badge ok">проверена</span>' : ''}</div>
      ${c.descriptionRaw ? `<div class="raw">${esc(c.descriptionRaw)}</div>` : `<div class="muted">описания с карт нет</div>`}
    </div>
    <div class="actions" style="flex-direction:column">
      <form method="post" action="/admin/companies/${attr(c.id)}/call">
        <input type="text" name="note" placeholder="заметка к звонку" style="width:220px">
        <button type="submit" class="btn-primary">Отметить звонок</button>
      </form>
      ${deleteDialog(c.id)}
      <a class="btn" href="/admin/companies/${attr(c.id)}">Карточка</a>
    </div>
  </div>
</article>`
    })
    .join('')

  const empty = opts.items.length === 0 ? `<p>В этом списке никого нет.</p>` : ''
  const q = encodeURIComponent(opts.q)
  const base = `/admin?filter=${encodeURIComponent(opts.filter)}${opts.q ? `&q=${q}` : ''}`

  return layout({
    title: 'Обзвон поставщиков — Агора',
    user: opts.user,
    active: 'call',
    counts: opts.counts,
    body: `<h1>Обзвон поставщиков</h1>
${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ''}
${opts.notice ? `<div class="ok">${esc(opts.notice)}</div>` : ''}
<p class="meta">Не обзвонено: <b>${opts.counts.uncalled}</b> · без телефона: <b>${opts.extraCounts.noPhone}</b> · ликвидированных: <b>${opts.extraCounts.liquidated}</b> · всего живых: <b>${opts.extraCounts.alive}</b></p>
<div class="tabs">
  ${tab('uncalled', '/admin?filter=uncalled', `Не обзвонены (${opts.counts.uncalled})`)}
  ${tab('liquidated', '/admin?filter=liquidated', `Ликвидированные (${opts.extraCounts.liquidated})`)}
  ${tab('nophone', '/admin?filter=nophone', `Без телефона (${opts.extraCounts.noPhone})`)}
  ${tab('all', '/admin?filter=all', `Все (${opts.extraCounts.alive})`)}
</div>
<form class="search" method="get" action="/admin">
  <input type="hidden" name="filter" value="${attr(opts.filter)}">
  <input type="text" name="q" value="${attr(opts.q)}" placeholder="имя, телефон, ИНН, адрес">
  <button type="submit">Найти</button>
</form>
${cards}${empty}
${pager(base, opts.page, opts.total, opts.perPage)}`,
  })
}

export function deletedPage(opts: {
  user: AdminUser
  counts: NavCounts
  items: {
    company: typeof companies.$inferSelect
    deletedByEmail: string | null
    deletedByName: string | null
  }[]
  total: number
  page: number
  perPage: number
}): string {
  const rows = opts.items
    .map(({ company: c, deletedByEmail, deletedByName }) => {
      return `<tr>
  <td><a href="/admin/companies/${attr(c.id)}">${esc(c.name)}</a></td>
  <td>${esc(c.deletedReason)}</td>
  <td>${esc(formatMoscow(c.deletedAt))}</td>
  <td>${esc(deletedByName || deletedByEmail || c.deletedBy)}</td>
</tr>`
    })
    .join('')
  return layout({
    title: 'Удалённые компании — Агора',
    user: opts.user,
    active: 'deleted',
    counts: opts.counts,
    body: `<h1>Удалённые компании</h1>
<p class="muted">Мягкое удаление: запись остаётся в базе с причиной. Из этого списка собирается статистика обзвона.</p>
<table>
  <thead><tr><th>Компания</th><th>Причина</th><th>Когда</th><th>Кто</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="4">Пока никого не удаляли</td></tr>`}</tbody>
</table>
${pager('/admin/deleted', opts.page, opts.total, opts.perPage)}`,
  })
}

export function companyPage(opts: {
  user: AdminUser
  counts: NavCounts
  company: typeof companies.$inferSelect
  selectedCategoryIds: string[]
  tree: { roots: (typeof categories.$inferSelect)[]; byParent: Map<string | null, (typeof categories.$inferSelect)[]> }
  error?: string
  notice?: string
}): string {
  const c = opts.company
  const childrenOf = (id: string | null) => opts.tree.byParent.get(id) ?? []
  const catHtml = opts.tree.roots
    .map((root) => {
      const kids = childrenOf(root.id)
      const box = (cat: typeof root) =>
        `<label><input type="checkbox" name="category_id" value="${attr(cat.id)}" ${opts.selectedCategoryIds.includes(cat.id) ? 'checked' : ''}> ${esc(cat.name)}</label>`
      return `<div><strong>${box(root)}</strong>${kids.map(box).join('')}</div>`
    })
    .join('')

  return layout({
    title: `${c.name} — Обзвон`,
    user: opts.user,
    active: 'call',
    counts: opts.counts,
    body: `<p><a href="/admin">← к обзвону</a></p>
<h1>${esc(c.name)}</h1>
${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ''}
${opts.notice ? `<div class="ok">${esc(opts.notice)}</div>` : ''}
${c.isDeleted ? `<div class="error">Удалена ${esc(formatMoscow(c.deletedAt))}. Причина: ${esc(c.deletedReason)}</div>` : ''}
<div class="card">
  <div class="row">
    <div>${c.phone ? `<div class="phone"><a href="${attr(telHref(c.phone))}">${esc(c.phone)}</a></div>` : '<div class="phone">нет телефона</div>'}</div>
    <div>${c.website ? `<a href="${attr(c.website)}" target="_blank" rel="noreferrer">${esc(c.website)}</a>` : ''}</div>
  </div>
  ${c.descriptionRaw ? `<div class="raw">${esc(c.descriptionRaw)}</div>` : ''}
  <div class="actions">
    <form method="post" action="/admin/companies/${attr(c.id)}/call">
      <input type="text" name="note" value="${attr(c.callNote)}" placeholder="заметка к звонку" style="width:280px">
      <button type="submit" class="btn-primary">Отметить звонок</button>
    </form>
    ${c.isDeleted ? '' : deleteDialog(c.id)}
    <form method="post" action="/admin/companies/${attr(c.id)}/verify">
      <button type="submit">Отметить проверенной</button>
    </form>
  </div>
  <p class="muted">Звонили: ${esc(formatMoscow(c.calledAt))} · проверена: ${c.isVerified ? 'да' : 'нет'}</p>
</div>

<form method="post" action="/admin/companies/${attr(c.id)}">
  <div class="grid">
    <div>
      <label>Название</label>
      <input type="text" name="name" value="${attr(c.name)}" required>
      <label>Юр. название</label>
      <input type="text" name="legal_name" value="${attr(c.legalName)}">
      <label>ИНН</label>
      <input type="text" name="inn" value="${attr(c.inn)}">
      <label>ОГРН</label>
      <input type="text" name="ogrn" value="${attr(c.ogrn)}">
      <label>КПП</label>
      <input type="text" name="kpp" value="${attr(c.kpp)}">
      <label>ОКВЭД</label>
      <input type="text" name="okved" value="${attr(c.okved)}">
      <label>Статус ЕГРЮЛ</label>
      <input type="text" name="egrul_status" value="${attr(c.egrulStatus)}">
      <label>Статус парсера (только чтение)</label>
      <div class="readonly">${esc(c.status)}</div>
    </div>
    <div>
      <label>Город</label>
      <input type="text" name="city" value="${attr(c.city)}">
      <label>Адрес</label>
      <input type="text" name="address" value="${attr(c.address)}">
      <label>Телефон</label>
      <input type="text" name="phone" value="${attr(c.phone)}">
      <label>Сайт</label>
      <input type="text" name="website" value="${attr(c.website)}">
      <label>Email</label>
      <input type="text" name="email" value="${attr(c.email)}">
      <label>Теги продукции (через запятую)</label>
      <input type="text" name="products_tags" value="${attr((c.productsTags ?? []).join(', '))}">
      <label><input type="checkbox" name="is_verified" value="1" ${c.isVerified ? 'checked' : ''}> Проверена вручную</label>
    </div>
  </div>
  <label>Наш текст на сайт</label>
  <textarea name="description">${esc(c.description)}</textarea>
  <label>Описание с карт (не публикуется)</label>
  <textarea name="description_raw">${esc(c.descriptionRaw)}</textarea>
  <label>Категории</label>
  <input type="hidden" name="category_id" value="">
  <div class="cats">${catHtml}</div>
  <p><button class="btn-primary" type="submit">Сохранить</button></p>
</form>

<div class="card" id="delete">
  <h2>Не существует</h2>
  <p>Компанию нельзя стереть из базы. Кнопка помечает её удалённой и прячет с сайта.</p>
  ${
    c.isDeleted
      ? `<p>Уже удалена. Причина: ${esc(c.deletedReason)}</p>`
      : `<form method="post" action="/admin/companies/${attr(c.id)}/delete">
    <label>Причина (обязательно)</label>
    <textarea name="reason" required minlength="2" placeholder="Почему решили, что компании нет"></textarea>
    <p><button class="danger" type="submit">Удалить из каталога</button></p>
  </form>`
  }
</div>`,
  })
}

export function claimsPage(opts: {
  user: AdminUser
  counts: NavCounts
  items: { claim: typeof companyClaims.$inferSelect; companyName: string; companySlug: string }[]
  status: string
}): string {
  const tab = (id: string, label: string) =>
    `<a href="/admin/claims?status=${attr(id)}" class="${opts.status === id ? 'active' : ''}">${label}</a>`
  const rows = opts.items
    .map(
      ({ claim, companyName }) => `<tr>
  <td><a href="/admin/claims/${attr(claim.id)}">${esc(claim.type)}</a></td>
  <td>${esc(claim.status)}</td>
  <td><a href="/admin/companies/${attr(claim.companyId)}">${esc(companyName)}</a></td>
  <td>${esc(claim.name)}</td>
  <td>${esc(claim.phone)}</td>
  <td>${esc(formatMoscow(claim.createdAt))}</td>
</tr>`,
    )
    .join('')
  return layout({
    title: 'Обращения — Агора',
    user: opts.user,
    active: 'claims',
    counts: opts.counts,
    body: `<h1>Обращения компаний</h1>
<div class="tabs">
  ${tab('', 'Все')}
  ${tab('new', 'Новые')}
  ${tab('in_review', 'На разборе')}
  ${tab('applied', 'Применены')}
  ${tab('rejected', 'Отклонены')}
</div>
<table>
  <thead><tr><th>Тип</th><th>Статус</th><th>Компания</th><th>Кто</th><th>Телефон</th><th>Когда</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="6">Обращений нет</td></tr>`}</tbody>
</table>`,
  })
}

export function claimPage(opts: {
  user: AdminUser
  counts: NavCounts
  claim: typeof companyClaims.$inferSelect
  companyName: string
  notice?: string
}): string {
  const c = opts.claim
  return layout({
    title: `Обращение ${c.type} — Агора`,
    user: opts.user,
    active: 'claims',
    counts: opts.counts,
    body: `<p><a href="/admin/claims">← к обращениям</a></p>
<h1>Обращение: ${esc(c.type)}</h1>
${opts.notice ? `<div class="ok">${esc(opts.notice)}</div>` : ''}
<div class="card">
  <p>Компания: <a href="/admin/companies/${attr(c.companyId)}">${esc(opts.companyName)}</a></p>
  <p>Статус: <b>${esc(c.status)}</b></p>
  <p>Кто: ${esc(c.name)} · ${esc(c.position)}</p>
  <p>Телефон: ${c.phone ? `<a href="${attr(telHref(c.phone))}">${esc(c.phone)}</a>` : '—'}</p>
  <p>Email: ${esc(c.email)}</p>
  <div class="raw">${esc(c.message) || 'без текста'}</div>
  <div class="actions">
    <form method="post" action="/admin/claims/${attr(c.id)}">
      <input type="hidden" name="status" value="in_review">
      <button type="submit">В работу</button>
    </form>
    <form method="post" action="/admin/claims/${attr(c.id)}">
      <input type="hidden" name="status" value="applied">
      <button type="submit" class="btn-primary">Применить</button>
    </form>
    <form method="post" action="/admin/claims/${attr(c.id)}">
      <input type="hidden" name="status" value="rejected">
      <button type="submit" class="danger">Отклонить</button>
    </form>
  </div>
  ${c.type === 'delete' ? `<p class="muted">«Применить» не удаляет компанию само. Чтобы убрать её с сайта, на карточке нажмите «Не существует» и укажите причину.</p>` : ''}
  ${c.type === 'verify' ? `<p class="muted">«Применить» поставит компании отметку «проверена».</p>` : ''}
</div>`,
  })
}

export function dadataPage(opts: {
  user: AdminUser
  counts: NavCounts
  items: {
    company: typeof companies.$inferSelect
    sources: (typeof companySources.$inferSelect)[]
    suggestions: { sourceId: string; items: DadataSuggestion[] }[]
  }[]
  notice?: string
}): string {
  const cards = opts.items
    .map(({ company, suggestions }) => {
      const options = suggestions
        .flatMap(({ sourceId, items }) =>
          items.map(
            (s) => `<tr>
  <td>
    <form method="post" action="/admin/companies/${attr(company.id)}/dadata/accept">
      <input type="hidden" name="source_id" value="${attr(sourceId)}">
      <input type="hidden" name="inn" value="${attr(s.inn)}">
      <button type="submit" class="btn-primary">Принять</button>
    </form>
  </td>
  <td>${esc(s.legalName || s.value)}</td>
  <td>${esc(s.inn)}</td>
  <td>${esc(s.ogrn)}</td>
  <td>${esc(s.egrulStatus)}</td>
  <td>${esc(s.address)}</td>
</tr>`,
          ),
        )
        .join('')
      return `<article class="card">
  <h2><a href="/admin/companies/${attr(company.id)}">${esc(company.name)}</a></h2>
  <p class="meta">${esc(company.city)} · ${esc(company.address)} · ${company.phone ? esc(company.phone) : 'нет телефона'}</p>
  <table>
    <thead><tr><th></th><th>Юрлицо</th><th>ИНН</th><th>ОГРН</th><th>ЕГРЮЛ</th><th>Адрес</th></tr></thead>
    <tbody>${options || `<tr><td colspan="6">Кандидатов нет</td></tr>`}</tbody>
  </table>
</article>`
    })
    .join('')
  return layout({
    title: 'Очередь DaData — Агора',
    user: opts.user,
    active: 'dadata',
    counts: opts.counts,
    body: `<h1>Несматченные DaData</h1>
<p class="muted">Компании без ИНН, у которых DaData нашла кандидатов. Примите одного — в карточку запишутся ИНН, ОГРН, статус ЕГРЮЛ.</p>
${opts.notice ? `<div class="ok">${esc(opts.notice)}</div>` : ''}
${cards || '<p>Очередь пуста.</p>'}`,
  })
}

export function categoriesPage(opts: {
  user: AdminUser
  counts: NavCounts
  roots: (typeof categories.$inferSelect)[]
  byParent: Map<string | null, (typeof categories.$inferSelect)[]>
  error?: string
  notice?: string
}): string {
  const kids = (id: string) => opts.byParent.get(id) ?? []
  const row = (cat: typeof categories.$inferSelect, depth: number): string => {
    const pad = depth ? `style="padding-left:${depth * 24}px"` : ''
    return `<tr>
  <td ${pad}>${esc(cat.name)} <span class="muted">${esc(cat.slug)}</span></td>
  <td>${cat.isActive ? 'вкл' : 'выкл'}</td>
  <td>${cat.sortOrder}</td>
  <td>
    <form method="post" action="/admin/categories/${attr(cat.id)}/move" style="display:inline">
      <input type="hidden" name="direction" value="up"><button type="submit">↑</button>
    </form>
    <form method="post" action="/admin/categories/${attr(cat.id)}/move" style="display:inline">
      <input type="hidden" name="direction" value="down"><button type="submit">↓</button>
    </form>
    <form method="post" action="/admin/categories/${attr(cat.id)}" style="display:inline">
      <input type="hidden" name="is_active" value="${cat.isActive ? '0' : '1'}">
      <button type="submit">${cat.isActive ? 'Выключить' : 'Включить'}</button>
    </form>
    <form method="post" action="/admin/categories/${attr(cat.id)}" style="display:inline">
      <input type="text" name="name" value="${attr(cat.name)}" style="width:180px">
      <button type="submit">Переименовать</button>
    </form>
  </td>
</tr>${kids(cat.id).map((child) => row(child, depth + 1)).join('')}`
  }
  const bodyRows = opts.roots.map((root) => row(root, 0)).join('')
  return layout({
    title: 'Категории — Агора',
    user: opts.user,
    active: 'categories',
    counts: opts.counts,
    body: `<h1>Категории</h1>
${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ''}
${opts.notice ? `<div class="ok">${esc(opts.notice)}</div>` : ''}
<table>
  <thead><tr><th>Название</th><th>Видимость</th><th>Порядок</th><th></th></tr></thead>
  <tbody>${bodyRows}</tbody>
</table>
<div class="card">
  <h2>Добавить категорию</h2>
  <form method="post" action="/admin/categories">
    <label>Название</label>
    <input type="text" name="name" required>
    <label>slug (пусто — сам)</label>
    <input type="text" name="slug">
    <label>Родитель</label>
    <select name="parent_id">
      <option value="">— верхний уровень —</option>
      ${opts.roots.map((r) => `<option value="${attr(r.id)}">${esc(r.name)}</option>`).join('')}
    </select>
    <p><button class="btn-primary" type="submit">Создать</button></p>
  </form>
</div>`,
  })
}
