import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DAILY_LIMIT } from './types.ts'

export function moscowDay(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' })
}

export class DailyLimitError extends Error {
  readonly code = 'DADATA_DAILY_LIMIT' as const
  constructor(
    readonly used: number,
    readonly limit: number,
  ) {
    super(
      `DaData: дневной лимит ${limit} исчерпан (использовано ${used}). Остановка, продолжим завтра.`,
    )
    this.name = 'DailyLimitError'
  }
}

export interface QuotaStore {
  getUsed(day: string): Promise<number>
  setUsed(day: string, used: number): Promise<void>
}

export class MemoryQuotaStore implements QuotaStore {
  private day = ''
  private used = 0

  constructor(initial = 0, day = moscowDay()) {
    this.used = initial
    this.day = day
  }

  async getUsed(day: string): Promise<number> {
    if (day !== this.day) {
      this.day = day
      this.used = 0
    }
    return this.used
  }

  async setUsed(day: string, used: number): Promise<void> {
    this.day = day
    this.used = used
  }
}

type FileShape = { day: string; used: number }

export class FileQuotaStore implements QuotaStore {
  constructor(private readonly path: string) {}

  async getUsed(day: string): Promise<number> {
    const data = await this.read()
    if (!data || data.day !== day) return 0
    return data.used
  }

  async setUsed(day: string, used: number): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const payload: FileShape = { day, used }
    await writeFile(this.path, JSON.stringify(payload), 'utf8')
  }

  private async read(): Promise<FileShape | null> {
    try {
      const raw = await readFile(this.path, 'utf8')
      const parsed = JSON.parse(raw) as FileShape
      if (!parsed || typeof parsed.day !== 'string' || typeof parsed.used !== 'number') return null
      return parsed
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return null
      throw err
    }
  }
}

export class DailyQuota {
  constructor(
    private readonly store: QuotaStore,
    readonly limit = DAILY_LIMIT,
    private readonly today: () => string = moscowDay,
  ) {}

  async used(): Promise<number> {
    return this.store.getUsed(this.today())
  }

  async remaining(): Promise<number> {
    return Math.max(0, this.limit - (await this.used()))
  }

  async consume(n = 1): Promise<number> {
    const day = this.today()
    const current = await this.store.getUsed(day)
    if (current + n > this.limit) {
      throw new DailyLimitError(current, this.limit)
    }
    const next = current + n
    await this.store.setUsed(day, next)
    return next
  }
}
