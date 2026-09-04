import type { Db } from '@agora/db'
import { companyCounts } from './companies.ts'
import { newClaimsCount } from './claims.ts'
import { dadataQueueCount } from './dadata.ts'
import type { NavCounts } from './html.ts'

export async function getNavCounts(db: Db): Promise<NavCounts & { noPhone: number; liquidated: number; alive: number }> {
  const [counts, claims, dadata] = await Promise.all([companyCounts(db), newClaimsCount(db), dadataQueueCount(db)])
  return {
    uncalled: counts.uncalled,
    deleted: counts.deleted,
    claims,
    dadata,
    noPhone: counts.noPhone,
    liquidated: counts.liquidated,
    alive: counts.alive,
  }
}
