import type { DedupKeys, ExistingCompany } from './types.ts'

/**
 * Dedup order is identity then spec §3: INN → domain → name+phone.
 * INN present ⇒ do not fall through to domain even if INN missed.
 * Falling through would glue different legal entities that share a site.
 */
export function findDuplicate(
  incoming: DedupKeys,
  existing: ExistingCompany[],
): ExistingCompany | undefined {
  if (incoming.yandexOid) {
    const byOid = existing.find((c) => c.yandexOid === incoming.yandexOid)
    if (byOid) return byOid
  }
  if (incoming.inn) {
    return existing.find((c) => c.inn === incoming.inn)
  }
  if (incoming.domain) {
    return existing.find((c) => c.domain === incoming.domain)
  }
  if (incoming.nameNorm && incoming.phone) {
    return existing.find(
      (c) =>
        c.nameNorm === incoming.nameNorm &&
        (c.phone === incoming.phone || Boolean(c.phones?.includes(incoming.phone!))),
    )
  }
  return undefined
}

export class CompanyIndex {
  private byId = new Map<string, ExistingCompany>()
  private byOid = new Map<string, string>()
  private byInn = new Map<string, string>()
  private byDomain = new Map<string, string>()
  private byNamePhone = new Map<string, string>()

  add(company: ExistingCompany): void {
    this.byId.set(company.id, company)
    if (company.yandexOid) this.byOid.set(company.yandexOid, company.id)
    if (company.inn) this.byInn.set(company.inn, company.id)
    if (company.domain && !this.byDomain.has(company.domain)) {
      this.byDomain.set(company.domain, company.id)
    }
    if (company.nameNorm && company.phone) {
      this.byNamePhone.set(`${company.nameNorm}|${company.phone}`, company.id)
    }
  }

  lookup(keys: DedupKeys): ExistingCompany | undefined {
    if (keys.yandexOid) {
      const id = this.byOid.get(keys.yandexOid)
      if (id) return this.byId.get(id)
    }
    if (keys.inn) {
      const id = this.byInn.get(keys.inn)
      return id ? this.byId.get(id) : undefined
    }
    if (keys.domain) {
      const id = this.byDomain.get(keys.domain)
      return id ? this.byId.get(id) : undefined
    }
    if (keys.nameNorm && keys.phone) {
      const id = this.byNamePhone.get(`${keys.nameNorm}|${keys.phone}`)
      return id ? this.byId.get(id) : undefined
    }
    return undefined
  }

  values(): ExistingCompany[] {
    return [...this.byId.values()]
  }
}
