/**
 * Подключение к базе. Один вход для всех приложений — не создавайте свои пулы.
 *
 * Два движка за одним интерфейсом:
 *
 *  - **dev: PGlite** — настоящий Postgres, собранный в WASM, живёт npm-пакетом
 *    и файлами в `.pgdata/`. Ничего не ставить, никакого сервиса, работает
 *    на любом пути.
 *    Почему не нативный Postgres: на машине владельца `scoop install postgresql`
 *    ставится, но `initdb` падает — `invalid byte sequence for encoding "UTF8":
 *    0xd0 0xe0`. Это байты «Ра» в cp1251, то есть кириллица в имени пользователя
 *    Windows (`C:\Users\Рауан`). Не лечится ни ASCII-путём для данных, ни подменой
 *    USERNAME/TMP/LANG — проверено трижды. Docker, Podman и WSL на машине отсутствуют.
 *
 *  - **прод: node-postgres** — обычный Postgres на сервере.
 *
 * Выбор по `DATABASE_URL`: есть и начинается с `postgres://` — идём в реальный сервер,
 * иначе поднимаем PGlite. Прикладной код разницы не видит.
 */
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from './schema.js'

export * from './schema.js'
export { CATEGORY_SEED, seedCategories } from './seed-categories.js'
export type { CategorySeed } from './seed-categories.js'

/**
 * Путь к dev-базе привязан к пакету, а НЕ к текущей директории.
 * Относительный `.pgdata` ломался так: тесты запускаются из `apps/api`, и PGlite
 * молча создавал там вторую пустую базу вместо общей — все тесты падали на
 * truncate несуществующих таблиц, причём без внятной ошибки.
 */
const DEV_DATA_DIR =
  process.env.PGLITE_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', '.pgdata')

/**
 * Тип базы — `NodePgDatabase`, и для PGlite мы приводим экземпляр к нему.
 *
 * Почему не union `NodePgDatabase | PgliteDatabase`: на нём схлопываются перегрузки
 * и `.returning({...})` перестаёт компилироваться («Expected 0 arguments, but got 1»).
 * Почему не общий базовый `PgDatabase`: у него `execute()` возвращает `unknown`,
 * и каждый вызов `db.execute(sql\`...\`)` требует ручного приведения — таких мест
 * в коде уже больше десятка.
 *
 * Приведение безопасно по факту: билдер запросов у драйверов одинаковый, а результат
 * `execute()` у обоих — объект с полем `rows`, только у node-postgres в типе есть
 * ещё rowCount и fields. Код читает исключительно `.rows`.
 */
export type Db = NodePgDatabase<typeof schema>

let cached: Db | undefined
let pgliteClient: { close: () => Promise<void> } | undefined
let pgPool: { end: () => Promise<void> } | undefined

export async function getDb(): Promise<Db> {
  if (cached) return cached

  const url = process.env.DATABASE_URL

  if (url?.startsWith('postgres://') || url?.startsWith('postgresql://')) {
    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString: url })
    pgPool = pool
    cached = drizzlePg({ client: pool, schema }) as unknown as Db
    return cached
  }

  const { PGlite } = await import('@electric-sql/pglite')
  // pg_trgm нужен для поиска: одного FTS мало, русский стеммер даёт
  // «печать» → печа и «печатью» → печат. См. docs/API.md, раздел «Поиск».
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm')
  const client = await PGlite.create(DEV_DATA_DIR, { extensions: { pg_trgm } })
  usedPglite = true
  pgliteClient = client
  cached = drizzlePglite({ client, schema }) as unknown as Db
  return cached
}

/** Какой движок под капотом — нужно только мигратору, прикладному коду нет. */
export function isPglite(): boolean {
  return usedPglite
}

let usedPglite = false

/**
 * Закрывать ОБЯЗАТЕЛЬНО в любом CLI-скрипте.
 * Проверено: если процесс на PGlite завершается без close(), папка `.pgdata`
 * остаётся в грязном состоянии, и следующий `PGlite.create()` по ней
 * подвешивается наглухо — без ошибки, просто висит.
 */
export async function closeDb(): Promise<void> {
  await pgliteClient?.close()
  await pgPool?.end()
  pgliteClient = undefined
  pgPool = undefined
  cached = undefined
}
