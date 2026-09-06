-- Уникальный ключ суточных агрегатов, совместимый с PostgreSQL 14.
--
-- На проде (178.88.115.213) стоит PG 14.24 — общий сервер, апгрейдить нельзя,
-- на этом же Postgres живут чужие проекты. Поэтому NULLS NOT DISTINCT (PG15+)
-- использовать нельзя, хотя в dev на PGlite (PG17) он работает.
--
-- Проблема, которую решаем: company_id и category_id у многих срезов пустые
-- (`page_view` вообще без компании), а Postgres по умолчанию считает каждый NULL
-- уникальным — обычный UNIQUE не сработает, и джоба агрегации на каждом прогоне
-- вставляла бы новую строку вместо обновления.
--
-- Обход: уникальный индекс по выражениям с COALESCE и «нулевым» UUID как заглушкой.
--
-- ВАЖНО для TASK-011: ON CONFLICT обязан повторять выражения индекса ДОСЛОВНО,
-- иначе Postgres скажет «no unique or exclusion constraint matching». Правильно так:
--
--   INSERT INTO event_daily_aggregates (day, event, company_id, category_id, query, count)
--   VALUES (...)
--   ON CONFLICT (day, event,
--                coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
--                coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
--                coalesce(query, ''))
--   DO UPDATE SET count = event_daily_aggregates.count + excluded.count;
CREATE UNIQUE INDEX IF NOT EXISTS "event_daily_aggregates_key"
  ON "event_daily_aggregates" (
    "day",
    "event",
    coalesce("company_id", '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce("category_id", '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce("query", '')
  );
