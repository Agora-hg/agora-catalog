import { cityForQuery, isMoscow } from './normalize.ts'
import { DailyQuota } from './quota.ts'
import { DaDataHttpError, withRetry, type RetryOpts } from './retry.ts'
import {
  DADATA_PARTY_URL,
  type DaDataClient,
  type SuggestPartyRequest,
  type SuggestPartyResponse,
} from './types.ts'

export type HttpDaDataClientOpts = {
  token: string
  fetch?: typeof fetch
  retry?: RetryOpts
  quota?: DailyQuota
}

function locationsFor(city: string): Array<Record<string, string>> {
  if (isMoscow(city)) return [{ kladr_id: '77' }]
  return [{ city }]
}

function parseResponse(body: unknown): SuggestPartyResponse {
  if (!body || typeof body !== 'object') return { suggestions: [] }
  const suggestions = (body as { suggestions?: unknown }).suggestions
  if (!Array.isArray(suggestions)) return { suggestions: [] }
  return { suggestions: suggestions as SuggestPartyResponse['suggestions'] }
}

/** Один HTTP-запрос. Лимит и ретраи вешаются снаружи, чтобы 429/5xx считались в квоту. */
export function createHttpDaDataClient(opts: {
  token: string
  fetch?: typeof fetch
}): DaDataClient {
  const doFetch = opts.fetch ?? globalThis.fetch
  return {
    async suggestParty(req: SuggestPartyRequest): Promise<SuggestPartyResponse> {
      const city = cityForQuery(req.city)
      const res = await doFetch(DADATA_PARTY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Token ${opts.token}`,
        },
        body: JSON.stringify({
          query: req.query,
          count: 10,
          locations: locationsFor(city),
          branch_type: ['MAIN'],
        }),
      })
      const text = await res.text()
      if (!res.ok) {
        throw new DaDataHttpError(res.status, text, res.headers.get('Retry-After'))
      }
      try {
        return parseResponse(JSON.parse(text) as unknown)
      } catch {
        throw new DaDataHttpError(res.status, `invalid JSON: ${text.slice(0, 200)}`)
      }
    },
  }
}

export function withQuota(inner: DaDataClient, quota: DailyQuota): DaDataClient {
  return {
    async suggestParty(req: SuggestPartyRequest): Promise<SuggestPartyResponse> {
      await quota.consume(1)
      return inner.suggestParty(req)
    },
  }
}

export function withRetries(inner: DaDataClient, retry: RetryOpts = {}): DaDataClient {
  return {
    async suggestParty(req: SuggestPartyRequest): Promise<SuggestPartyResponse> {
      return withRetry(() => inner.suggestParty(req), retry)
    },
  }
}

/**
 * Ретраи снаружи квоты: каждая попытка HTTP (429/5xx) — отдельный запрос
 * и отдельная единица дневного лимита.
 */
export function createDaDataClient(opts: HttpDaDataClientOpts): DaDataClient {
  const http = createHttpDaDataClient({ token: opts.token, fetch: opts.fetch })
  const counted = opts.quota ? withQuota(http, opts.quota) : http
  return withRetries(counted, opts.retry)
}

export function createFixtureClient(
  fixture: Record<string, SuggestPartyResponse>,
  onCall?: (req: SuggestPartyRequest) => void,
): DaDataClient {
  return {
    async suggestParty(req: SuggestPartyRequest): Promise<SuggestPartyResponse> {
      onCall?.(req)
      return fixture[req.query] ?? { suggestions: [] }
    },
  }
}
