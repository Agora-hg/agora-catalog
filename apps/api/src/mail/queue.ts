import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { MailJob, MailMessage, MailTransport } from './types.ts'

const MAX_ATTEMPTS = 8

function backoffMs(attempts: number): number {
  return Math.min(60 * 60 * 1000, 5000 * 2 ** Math.max(0, attempts - 1))
}

export class MailQueue {
  private jobs = new Map<string, MailJob>()
  private timer: ReturnType<typeof setInterval> | null = null
  readonly failed: MailJob[] = []
  readonly sent: MailJob[] = []

  constructor(
    private transport: MailTransport,
    private dir?: string,
    private now: () => number = Date.now,
  ) {}

  async init(): Promise<void> {
    if (!this.dir) return
    await mkdir(this.dir, { recursive: true })
    const names = await readdir(this.dir)
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      try {
        const raw = await readFile(join(this.dir, name), 'utf8')
        const job = JSON.parse(raw) as MailJob
        if (job?.id && job.status === 'pending') this.jobs.set(job.id, job)
      } catch {
        // битый файл не должен валить очередь
      }
    }
  }

  async enqueue(
    message: MailMessage,
    meta?: MailJob['meta'],
  ): Promise<MailJob> {
    const job: MailJob = {
      id: randomUUID(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      createdAt: new Date(this.now()).toISOString(),
      attempts: 0,
      nextAttemptAt: this.now(),
      lastError: null,
      status: 'pending',
      meta,
    }
    this.jobs.set(job.id, job)
    await this.persist(job)
    return job
  }

  pending(): MailJob[] {
    return [...this.jobs.values()].filter((j) => j.status === 'pending')
  }

  reset(): void {
    this.jobs.clear()
    this.failed.length = 0
    this.sent.length = 0
  }

  async processDue(): Promise<{ sent: number; failed: number; retried: number }> {
    const now = this.now()
    let sent = 0
    let failed = 0
    let retried = 0
    for (const job of [...this.jobs.values()]) {
      if (job.status !== 'pending' || job.nextAttemptAt > now) continue
      try {
        await this.transport.send({ to: job.to, subject: job.subject, text: job.text })
        job.status = 'sent'
        job.lastError = null
        this.jobs.delete(job.id)
        this.sent.push(job)
        await this.removeFile(job.id)
        sent += 1
      } catch (err) {
        job.attempts += 1
        job.lastError = err instanceof Error ? err.message : String(err)
        if (job.attempts >= MAX_ATTEMPTS) {
          job.status = 'failed'
          this.jobs.delete(job.id)
          this.failed.push(job)
          await this.removeFile(job.id)
          failed += 1
        } else {
          job.nextAttemptAt = now + backoffMs(job.attempts)
          await this.persist(job)
          retried += 1
        }
      }
    }
    return { sent, failed, retried }
  }

  start(intervalMs = 10_000): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.processDue()
    }, intervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async persist(job: MailJob): Promise<void> {
    if (!this.dir) return
    await mkdir(this.dir, { recursive: true })
    await writeFile(join(this.dir, `${job.id}.json`), JSON.stringify(job), 'utf8')
  }

  private async removeFile(id: string): Promise<void> {
    if (!this.dir) return
    try {
      await unlink(join(this.dir, `${id}.json`))
    } catch {
      // нет файла — не страшно
    }
  }
}

export function requestMailText(opts: {
  id: string
  description: string
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
  quantity: string | null
  deliveryCity: string | null
  deadline: string | null
}): string {
  return [
    `Новая заявка ${opts.id}`,
    '',
    opts.description,
    '',
    `Имя: ${opts.customerName || '—'}`,
    `Телефон: ${opts.customerPhone || '—'}`,
    `Почта: ${opts.customerEmail || '—'}`,
    `Количество: ${opts.quantity || '—'}`,
    `Город: ${opts.deliveryCity || '—'}`,
    `Срок: ${opts.deadline || '—'}`,
  ].join('\n')
}
