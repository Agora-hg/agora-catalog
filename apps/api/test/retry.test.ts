import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDaDataClient } from '../src/enrich/client.ts'
import { DailyLimitError, DailyQuota, MemoryQuotaStore } from '../src/enrich/quota.ts'
import { backoffMs, DaDataHttpError, isRetryable, withRetry } from '../src/enrich/retry.ts'
import { DADATA_PARTY_URL } from '../src/enrich/types.ts'

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('retry', () => {
  it('uses exponential backoff on 429 and 5xx', async () => {
    const delays: number[] = []
    let n = 0
    const result = await withRetry(
      async () => {
        n += 1
        if (n < 3) throw new DaDataHttpError(n === 1 ? 503 : 429, 'busy')
        return 'ok'
      },
      { maxAttempts: 5, baseDelayMs: 500, sleep: async (ms) => { delays.push(ms) } },
    )
    assert.equal(result, 'ok')
    assert.equal(n, 3)
    assert.deepEqual(delays, [500, 1000])
    assert.equal(backoffMs(1, 500, 30_000), 500)
    assert.equal(backoffMs(2, 500, 30_000), 1000)
    assert.equal(backoffMs(3, 500, 30_000), 2000)
  })

  it('does not retry 4xx other than 429', async () => {
    let n = 0
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            n += 1
            throw new DaDataHttpError(400, 'bad query')
          },
          { maxAttempts: 5, sleep: async () => undefined },
        ),
      (err: unknown) => err instanceof DaDataHttpError && err.status === 400,
    )
    assert.equal(n, 1)
  })

  it('does not retry a daily-limit stop', () => {
    const err = new DailyLimitError(10_000, 10_000)
    assert.equal(isRetryable(err), false)
  })

  it('honours Retry-After on 429', async () => {
    const delays: number[] = []
    let n = 0
    await withRetry(
      async () => {
        n += 1
        if (n === 1) throw new DaDataHttpError(429, 'slow', '2')
        return 'ok'
      },
      { maxAttempts: 3, baseDelayMs: 500, sleep: async (ms) => { delays.push(ms) } },
    )
    assert.deepEqual(delays, [2000])
  })
})

describe('HTTP client', () => {
  it('sends Token auth, name+city, and counts each retry against quota', async () => {
    const bodies: unknown[] = []
    const headers: string[] = []
    let n = 0
    const quota = new DailyQuota(new MemoryQuotaStore(0), 10)
    const client = createDaDataClient({
      token: 'test-token',
      quota,
      retry: { maxAttempts: 3, baseDelayMs: 1, sleep: async () => undefined },
      fetch: async (input, init) => {
        n += 1
        assert.equal(String(input), DADATA_PARTY_URL)
        headers.push(String((init?.headers as Record<string, string>).Authorization))
        bodies.push(JSON.parse(String(init?.body)))
        if (n < 3) return jsonResponse(503, { message: 'unavailable' })
        return jsonResponse(200, {
          suggestions: [{ value: 'ООО ТЕСТ', data: { inn: '7700000000' } }],
        })
      },
    })

    const res = await client.suggestParty({ query: 'ООО Тест', city: 'Москва' })
    assert.equal(n, 3)
    assert.equal(await quota.used(), 3)
    assert.equal(headers[0], 'Token test-token')
    const body = bodies[0] as { query: string; locations: Array<{ kladr_id?: string }> }
    assert.equal(body.query, 'ООО Тест')
    assert.equal(body.locations[0]?.kladr_id, '77')
    assert.equal(res.suggestions[0]?.value, 'ООО ТЕСТ')
  })
})
