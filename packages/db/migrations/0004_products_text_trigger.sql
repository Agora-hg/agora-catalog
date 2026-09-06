-- products_text заполняется триггером, а не руками.
--
-- Почему вообще есть отдельная колонка: в поисковый вектор нельзя затащить массив
-- products_tags напрямую — array_to_string помечена STABLE, а generated-колонка
-- требует IMMUTABLE (Postgres падает с «generation expression is not immutable»).
--
-- Почему триггером, а не правилом «пиши оба поля»: это правило уже забыли дважды.
-- TASK-006 (импортёр) и TASK-008 (тесты каталога) писали products_tags без
-- products_text, и поиск по тегам молча перестал находить — при полностью зелёном
-- tsc и без единой ошибки в логах. Такое правило нельзя держать в документации,
-- его надо держать в базе.
--
-- В триггере array_to_string использовать МОЖНО: требование IMMUTABLE относится
-- только к generated-колонкам.
CREATE OR REPLACE FUNCTION companies_sync_products_text() RETURNS trigger AS $$
BEGIN
  NEW.products_text := coalesce(array_to_string(NEW.products_tags, ' '), '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS companies_products_text ON companies;--> statement-breakpoint
CREATE TRIGGER companies_products_text
  BEFORE INSERT OR UPDATE OF products_tags ON companies
  FOR EACH ROW EXECUTE FUNCTION companies_sync_products_text();--> statement-breakpoint
-- добить уже существующие строки
UPDATE companies SET products_text = coalesce(array_to_string(products_tags, ' '), '')
WHERE products_text IS DISTINCT FROM coalesce(array_to_string(products_tags, ' '), '');
