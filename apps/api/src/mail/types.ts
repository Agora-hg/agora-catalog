export type MailMessage = {
  to: string
  subject: string
  text: string
}

export type MailTransport = {
  send(message: MailMessage): Promise<void>
}

export type MailJob = {
  id: string
  to: string
  subject: string
  text: string
  createdAt: string
  attempts: number
  nextAttemptAt: number
  lastError: string | null
  status: 'pending' | 'sent' | 'failed'
  meta?: { kind: string; requestId?: string; claimId?: string }
}
