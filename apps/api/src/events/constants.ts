export const EVENT_NAMES = [
  'page_view',
  'card_view',
  'card_expand',
  'website_click',
  'filter_apply',
  'search',
  'request_form_open',
  'request_submit',
  'claim_open',
  'claim_submit',
] as const

export type EventName = (typeof EVENT_NAMES)[number]

export const EVENT_NAME_SET = new Set<string>(EVENT_NAMES)

export const MAX_BATCH = 50
export const RETENTION_DAYS = 90
