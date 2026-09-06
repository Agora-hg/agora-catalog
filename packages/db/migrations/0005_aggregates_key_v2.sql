-- Разрезы агрегатов приведены к тому, что реально пишет джоба из TASK-011.
--
-- Я в 0002 угадал форму таблицы неверно: сделал колонку `query`, а потребителю
-- нужны `dimension` + `dimension_value` (плюс `unique_sessions`). Схема должна
-- следовать за потребителем, а не наоборот.
--
-- Написано руками, а не через drizzle-kit generate: он на переименовании колонки
-- спрашивает интерактивно «rename или add», а в неинтерактивном запуске падает.
ALTER TABLE "event_daily_aggregates" DROP COLUMN IF EXISTS "query";--> statement-breakpoint
ALTER TABLE "event_daily_aggregates"
  ADD COLUMN IF NOT EXISTS "dimension" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "dimension_value" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "unique_sessions" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "extra" jsonb;--> statement-breakpoint
-- PG14: COALESCE вместо NULLS NOT DISTINCT (тот появился в PG15).
-- ON CONFLICT в джобе обязан повторять эти выражения ДОСЛОВНО, иначе Postgres
-- скажет «no unique or exclusion constraint matching».
DROP INDEX IF EXISTS "event_daily_aggregates_key";--> statement-breakpoint
CREATE UNIQUE INDEX "event_daily_aggregates_key"
  ON "event_daily_aggregates" (
    "day", "event",
    coalesce("company_id", '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce("category_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "dimension", "dimension_value"
  );
