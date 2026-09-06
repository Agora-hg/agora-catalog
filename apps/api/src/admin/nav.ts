import type { Db } from '@agora/db'
import { companyCounts } from './companies.ts'
import { newRequestsCount } from './requests.ts'
import { newClaimsCount } from './claims.ts'
import type { NavCounts } from './html.ts'

export async function getNavCounts(db: Db): Promise<NavCounts & { noPhone: number; liquidated: number; alive: number }> {
  const [counts, claims, requests] = await Promise.all([companyCounts(db), newClaimsCount(db), newRequestsCount(db)])
  return {
    uncalled: counts.uncalled,
    deleted: counts.deleted,
    claims,
    requests,
    noPhone: counts.noPhone,
    liquidated: counts.liquidated,
    alive: counts.alive,
  }
}
