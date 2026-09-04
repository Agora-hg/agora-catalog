import nodemailer from 'nodemailer'
import type { MailMessage, MailTransport } from './types.ts'

export type SmtpOptions = {
  host: string
  port: number
  user?: string
  pass?: string
  from: string
}

export function createSmtpTransport(opts: SmtpOptions): MailTransport {
  const transporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.port === 465,
    auth: opts.user ? { user: opts.user, pass: opts.pass ?? '' } : undefined,
  })
  return {
    async send(message: MailMessage) {
      await transporter.sendMail({
        from: opts.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      })
    },
  }
}

export function smtpFromEnv(): SmtpOptions | null {
  const host = process.env.SMTP_HOST?.trim()
  if (!host) return null
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587) || 587,
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from: process.env.SMTP_FROM?.trim() || 'noreply@localhost',
  }
}
