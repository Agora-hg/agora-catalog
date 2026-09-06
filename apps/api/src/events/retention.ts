import { events, type Db } from '@agora/db'
import { sql } from 'drizzle-orm'
import { RETENTION_DAYS } from './constants.js'

/**
 * Суточные агрегаты. Таблицы нет в packages/db/src/schema.ts —
 * схему трогает только тимлид. Создаём IF NOT EXISTS из джобы.
 * После добавления в схему этот DDL останется безопасным.
 */
export const AGGREGATES_TABLE_SQL = sql`
  CREATE TABLE IF NOT EXISTS event_daily_aggregates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    day date NOT NULL,
    event text NOT NULL,
    company_id uuid,
    category_id uuid,
    dimension text NOT NULL DEFAULT '',
    dimension_value text NOT NULL DEFAULT '',
    count integer NOT NULL,
    unique_visitors integer NOT NULL DEFAULT 0,
    unique_sessions integer NOT NULL DEFAULT 0,
    extra jsonb
  )
`
export const AGGREGATES_UNIQ_SQL = sql`
  CREATE UNIQUE INDEX IF NOT EXISTS event_daily_aggregates_uniq
  ON event_daily_aggregates (
    day,
    event,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    dimension,
    dimension_value
  )
`
export const AGGREGATES_DAY_IDX_SQL = sql`
  CREATE INDEX IF NOT EXISTS event_daily_aggregates_day_idx ON event_daily_aggregates (day)
`
export const AGGREGATES_EVENT_IDX_SQL = sql`
  CREATE INDEX IF NOT EXISTS event_daily_aggregates_event_idx ON event_daily_aggregates (event)
`

export type RetentionResult = {
  cutoff: Date
  deleted: number
  aggregateRows: number
}

/**
 * Оставлена пустой намеренно.
 *
 * TASK-011 создавал таблицу агрегатов сам через CREATE TABLE IF NOT EXISTS —
 * потому что схемой владеет тимлид и воркер правильно в неё не полез, а вынес
 * запрос в «нужно от тимлида». Теперь `event_daily_aggregates` есть в schema.ts
 * (миграции 0002 и 0003), и держать вторую, отличающуюся версию DDL в коде опасно:
 * на PG14 уникальный ключ там строится по COALESCE, а не через NULLS NOT DISTINCT,
 * и самодельная таблица молча ломала бы upsert.
 */
export async function ensureAggregatesTable(_db: Db): Promise<void> {
  // no-op: таблицу создаёт миграция
}

export async function runRetention(db: Db, now = new Date()): Promise<RetentionResult> {
  await ensureAggregatesTable(db)
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  return db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM event_daily_aggregates a
      USING (
        SELECT DISTINCT (created_at AT TIME ZONE 'Europe/Moscow')::date AS day
        FROM ${events}
        WHERE created_at < ${cutoff}
      ) d
      WHERE a.day = d.day
    `)

    await tx.execute(sql`
      INSERT INTO event_daily_aggregates (
        day, event, company_id, category_id, dimension, dimension_value,
        count, unique_visitors, unique_sessions
      )
      SELECT
        (created_at AT TIME ZONE 'Europe/Moscow')::date,
        event,
        company_id,
        category_id,
        '',
        '',
        count(*)::int,
        count(DISTINCT visitor_id)::int,
        count(DISTINCT session_id)::int
      FROM ${events}
      WHERE created_at < ${cutoff}
      GROUP BY 1, 2, 3, 4
    `)

    await tx.execute(sql`
      INSERT INTO event_daily_aggregates (
        day, event, company_id, category_id, dimension, dimension_value,
        count, unique_visitors, unique_sessions
      )
      SELECT
        (created_at AT TIME ZONE 'Europe/Moscow')::date,
        'search',
        NULL,
        NULL,
        'q',
        trim(payload->>'q'),
        count(*)::int,
        count(DISTINCT visitor_id)::int,
        count(DISTINCT session_id)::int
      FROM ${events}
      WHERE created_at < ${cutoff}
        AND event = 'search'
        AND coalesce(trim(payload->>'q'), '') <> ''
      GROUP BY 1, 6
    `)

    await tx.execute(sql`
      INSERT INTO event_daily_aggregates (
        day, event, company_id, category_id, dimension, dimension_value,
        count, unique_visitors, unique_sessions, extra
      )
      SELECT
        (created_at AT TIME ZONE 'Europe/Moscow')::date,
        'search',
        NULL,
        NULL,
        'q_zero',
        trim(payload->>'q'),
        count(*)::int,
        count(DISTINCT visitor_id)::int,
        count(DISTINCT session_id)::int,
        jsonb_build_object('results_count', 0)
      FROM ${events}
      WHERE created_at < ${cutoff}
        AND event = 'search'
        AND coalesce(trim(payload->>'q'), '') <> ''
        AND coalesce(payload->>'results_count', '') = '0'
      GROUP BY 1, 6
    `)

    await tx.execute(sql`
      INSERT INTO event_daily_aggregates (
        day, event, company_id, category_id, dimension, dimension_value,
        count, unique_visitors, unique_sessions
      )
      SELECT
        (created_at AT TIME ZONE 'Europe/Moscow')::date,
        'filter_apply',
        NULL,
        NULL,
        'filter',
        coalesce(nullif(trim(payload->>'filter'), ''), nullif(trim(payload->>'category'), ''), path, ''),
        count(*)::int,
        count(DISTINCT visitor_id)::int,
        count(DISTINCT session_id)::int
      FROM ${events}
      WHERE created_at < ${cutoff}
        AND event = 'filter_apply'
      GROUP BY 1, 6
    `)

    const counted = await tx.execute(sql`
      SELECT count(*)::int AS n
      FROM event_daily_aggregates
      WHERE day IN (
        SELECT DISTINCT (created_at AT TIME ZONE 'Europe/Moscow')::date
        FROM ${events}
        WHERE created_at < ${cutoff}
      )
    `)

    const removed = await tx
      .delete(events)
      .where(sql`${events.createdAt} < ${cutoff}`)
      .returning({ id: events.id })

    const aggregateRows = Number((counted.rows[0] as { n?: number } | undefined)?.n ?? 0)
    return { cutoff, deleted: removed.length, aggregateRows }
  })
}
