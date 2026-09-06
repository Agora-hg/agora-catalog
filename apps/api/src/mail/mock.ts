import type { MailMessage, MailTransport } from './types.ts'

export class MockTransport implements MailTransport {
  readonly sent: MailMessage[] = []
  failWith: Error | null = null

  async send(message: MailMessage): Promise<void> {
    if (this.failWith) throw this.failWith
    this.sent.push(message)
  }

  reset() {
    this.sent.length = 0
    this.failWith = null
  }
}

/** SMTP не настроен: письмо остаётся в очереди, заявку это не трогает. */
export class UnconfiguredTransport implements MailTransport {
  async send(): Promise<void> {
    throw new Error('SMTP not configured')
  }
}
