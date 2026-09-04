import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  DailyLimitError,
  DailyQuota,
  FileQuotaStore,
  MemoryQuotaStore,
  moscowDay,
} from '../src/enrich/quota.ts'

describe('DailyQuota', () => {
  it('stops at the counter, not after an API refusal', async () => {
    const quota = new DailyQuota(new MemoryQuotaStore(0), 2)
    assert.equal(await quota.consume(1), 1)
    assert.equal(await quota.consume(1), 2)
    await assert.rejects(
      () => quota.consume(1),
      (err: unknown) => {
        assert.ok(err instanceof DailyLimitError)
        assert.equal(err.used, 2)
        assert.equal(err.limit, 2)
        assert.match(err.message, /дневной лимит 2 исчерпан/)
        return true
      },
    )
    assert.equal(await quota.used(), 2)
    assert.equal(await quota.remaining(), 0)
  })

  it('resets on a new Moscow day', async () => {
    let day = '2026-09-04'
    const quota = new DailyQuota(new MemoryQuotaStore(0, day), 10, () => day)
    await quota.consume(3)
    day = '2026-09-05'
    assert.equal(await quota.used(), 0)
    assert.equal(await quota.consume(1), 1)
  })

  it('persists the counter in a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dadata-quota-'))
    const path = join(dir, 'quota.json')
    const day = moscowDay()
    const a = new DailyQuota(new FileQuotaStore(path), 10)
    await a.consume(4)
    const raw = JSON.parse(await readFile(path, 'utf8')) as { day: string; used: number }
    assert.equal(raw.day, day)
    assert.equal(raw.used, 4)
    const b = new DailyQuota(new FileQuotaStore(path), 10)
    assert.equal(await b.used(), 4)
    assert.equal(await b.consume(1), 5)
  })
})
