-- Уникальный ключ суточных агрегатов.
--
-- NULLS NOT DISTINCT обязателен: company_id и category_id у многих срезов пустые
-- (например `page_view` вообще без компании). По умолчанию Postgres считает
-- каждый NULL уникальным, поэтому обычный UNIQUE тут не работает — джоба
-- агрегации на каждом прогоне вставляла бы новую строку вместо обновления.
--
-- Пишем руками, потому что `.nullsNotDistinct()` в текущем drizzle-kit не реализован.
CREATE UNIQUE INDEX IF NOT EXISTS "event_daily_aggregates_key"
  ON "event_daily_aggregates" ("day", "event", "company_id", "category_id", "query")
  NULLS NOT DISTINCT;
