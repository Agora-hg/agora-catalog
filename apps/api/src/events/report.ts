import { companies, events, type Db } from '@agora/db'
import { sql } from 'drizzle-orm'

export type ReportRange = { from: Date; to: Date; days: number }

export type Funnel = {
  visits: number
  cards: number
  website: number
  requests: number
  converted: number
  visit_to_card_pct: number
  card_to_converted_pct: number
  visit_to_converted_pct: number
}

export type NamedCount = {
  key: string
  label: string
  count: number
  visitors: number
}

export type AnalyticsReport = {
  range: { from: string; to: string; days: number }
  visitors: number
  sessions: number
  funnel: Funnel
  topCompanies: NamedCount[]
  topSearches: NamedCount[]
  emptySearches: NamedCount[]
  topFilters: NamedCount[]
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows
  }
  return []
}

export function reportRange(daysRaw: unknown, now = new Date()): ReportRange {
  const parsed = Number(daysRaw)
  const days = parsed === 7 || parsed === 90 ? parsed : 30
  const to = now
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
  return { from, to, days }
}

export async function loadAnalyticsReport(db: Db, range: ReportRange): Promise<AnalyticsReport> {
  const { from, to } = range

  const [totals, funnelRows, companyRows, searchRows, emptyRows, filterRows] = await Promise.all([
    db.execute(sql`
      SELECT
        count(DISTINCT visitor_id)::int AS visitors,
        count(DISTINCT session_id)::int AS sessions
      FROM ${events}
      WHERE created_at >= ${from} AND created_at < ${to}
    `),
    db.execute(sql`
      SELECT
        count(DISTINCT session_id) FILTER (WHERE event = 'page_view')::int AS visits,
        count(DISTINCT session_id) FILTER (WHERE event = 'card_view')::int AS cards,
        count(DISTINCT session_id) FILTER (WHERE event = 'website_click')::int AS website,
        count(DISTINCT session_id) FILTER (WHERE event = 'request_submit')::int AS requests,
        count(DISTINCT session_id) FILTER (WHERE event IN ('website_click', 'request_submit'))::int AS converted
      FROM ${events}
      WHERE created_at >= ${from} AND created_at < ${to}
        AND session_id IS NOT NULL
    `),
    db.execute(sql`
      SELECT
        ${events.companyId} AS company_id,
        ${companies.slug} AS slug,
        ${companies.name} AS name,
        count(*)::int AS count,
        count(DISTINCT ${events.visitorId})::int AS visitors
      FROM ${events}
      LEFT JOIN ${companies} ON ${companies.id} = ${events.companyId}
      WHERE ${events.createdAt} >= ${from}
        AND ${events.createdAt} < ${to}
        AND ${events.event} = 'card_view'
      GROUP BY ${events.companyId}, ${companies.slug}, ${companies.name}
      ORDER BY count(*) DESC
      LIMIT 30
    `),
    db.execute(sql`
      SELECT
        trim(payload->>'q') AS key,
        count(*)::int AS count,
        count(DISTINCT visitor_id)::int AS visitors
      FROM ${events}
      WHERE created_at >= ${from} AND created_at < ${to}
        AND event = 'search'
        AND coalesce(trim(payload->>'q'), '') <> ''
      GROUP BY 1
      ORDER BY count(*) DESC
      LIMIT 30
    `),
    db.execute(sql`
      SELECT
        trim(payload->>'q') AS key,
        count(*)::int AS count,
        count(DISTINCT visitor_id)::int AS visitors
      FROM ${events}
      WHERE created_at >= ${from} AND created_at < ${to}
        AND event = 'search'
        AND coalesce(trim(payload->>'q'), '') <> ''
        AND coalesce(payload->>'results_count', '') = '0'
      GROUP BY 1
      ORDER BY count(*) DESC
      LIMIT 30
    `),
    db.execute(sql`
      SELECT
        coalesce(
          nullif(trim(payload->>'filter'), ''),
          nullif(trim(payload->>'category'), ''),
          path,
          '—'
        ) AS key,
        count(*)::int AS count,
        count(DISTINCT visitor_id)::int AS visitors
      FROM ${events}
      WHERE created_at >= ${from} AND created_at < ${to}
        AND event = 'filter_apply'
      GROUP BY 1
      ORDER BY count(*) DESC
      LIMIT 30
    `),
  ])

  const total = asRows<{ visitors: number; sessions: number }>(totals)[0] ?? { visitors: 0, sessions: 0 }
  const funnelRaw = asRows<{
    visits: number
    cards: number
    website: number
    requests: number
    converted: number
  }>(funnelRows)[0] ?? { visits: 0, cards: 0, website: 0, requests: 0, converted: 0 }

  const funnel: Funnel = {
    visits: funnelRaw.visits,
    cards: funnelRaw.cards,
    website: funnelRaw.website,
    requests: funnelRaw.requests,
    converted: funnelRaw.converted,
    visit_to_card_pct: pct(funnelRaw.cards, funnelRaw.visits),
    card_to_converted_pct: pct(funnelRaw.converted, funnelRaw.cards),
    visit_to_converted_pct: pct(funnelRaw.converted, funnelRaw.visits),
  }

  return {
    range: { from: from.toISOString(), to: to.toISOString(), days: range.days },
    visitors: total.visitors,
    sessions: total.sessions,
    funnel,
    topCompanies: asRows<{ company_id: string | null; slug: string | null; name: string | null; count: number; visitors: number }>(
      companyRows,
    ).map((row) => ({
      key: row.company_id ?? row.slug ?? '',
      label: row.name ?? row.slug ?? row.company_id ?? 'без компании',
      count: row.count,
      visitors: row.visitors,
    })),
    topSearches: asRows<{ key: string; count: number; visitors: number }>(searchRows).map((row) => ({
      key: row.key,
      label: row.key,
      count: row.count,
      visitors: row.visitors,
    })),
    emptySearches: asRows<{ key: string; count: number; visitors: number }>(emptyRows).map((row) => ({
      key: row.key,
      label: row.key,
      count: row.count,
      visitors: row.visitors,
    })),
    topFilters: asRows<{ key: string; count: number; visitors: number }>(filterRows).map((row) => ({
      key: row.key,
      label: row.key,
      count: row.count,
      visitors: row.visitors,
    })),
  }
}
