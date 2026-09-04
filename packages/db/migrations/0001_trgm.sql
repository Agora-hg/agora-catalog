-- Триграммный поиск как дополнение к FTS.
--
-- Зачем: русский снежковый стеммер даёт РАЗНЫЕ основы для существительных на «ь».
-- Проверено на живом движке:
--   «печать»  → 'печа'
--   «печатью» → 'печат'
-- То есть пользователь вводит слово в именительном падеже и не находит карточку,
-- где оно стоит в косвенном. Для «пакет», «гофрокороб», «упаковка» стеммер работает
-- правильно, но на «печать», «тетрадь», «ёмкость» ломается.
--
-- Лечим не заменой FTS, а вторым условием: FTS OR similarity по триграммам.
-- Побочно закрывает опечатки («лагатип», «гофракароб»), которых в поиске по каталогу
-- будет много.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_name_trgm_idx" ON "companies" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_products_text_trgm_idx" ON "companies" USING gin ("products_text" gin_trgm_ops);
