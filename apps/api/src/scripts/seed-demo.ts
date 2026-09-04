import {
  CATEGORY_SEED,
  adminUsers,
  categories,
  companies,
  companyClaims,
  companySources,
  createDb,
} from '@agora/db'
import { eq } from 'drizzle-orm'
import { hashPassword } from '../auth.ts'
import { envString } from '../env.ts'

const { db, pool } = createDb(envString('DATABASE_URL'))

async function seedCategories() {
  const [existing] = await db.select({ id: categories.id }).from(categories).limit(1)
  if (existing) return
  let order = 0
  for (const parent of CATEGORY_SEED) {
    const [row] = await db
      .insert(categories)
      .values({ name: parent.name, slug: parent.slug, sortOrder: order++, isActive: true })
      .returning()
    let childOrder = 0
    for (const child of parent.children ?? []) {
      await db.insert(categories).values({
        name: child.name,
        slug: child.slug,
        parentId: row!.id,
        sortOrder: childOrder++,
        isActive: true,
      })
    }
  }
}

const email = envString('ADMIN_EMAIL').trim().toLowerCase()
const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1)
if (!admin) {
  await db.insert(adminUsers).values({
    email,
    passwordHash: await hashPassword(envString('ADMIN_PASSWORD')),
    name: 'Оператор',
    isActive: true,
  })
}

await seedCategories()

const [existingCompany] = await db.select({ id: companies.id }).from(companies).limit(1)
if (!existingCompany) {
  const [alinapak] = await db
    .insert(companies)
    .values({
      name: 'АлинаПак',
      slug: 'alinapak',
      city: 'Москва',
      address: 'Москва, ул. Такая-то, 5',
      phone: '+7 495 123-45-67',
      website: 'https://alinapak.ru',
      description: 'Производство гофрокоробов в Москве.',
      descriptionRaw: 'Производство четырёхклапанных гофрокоробов, тираж от 100 шт, печать логотипа.',
      productsTags: ['Четырёхклапанные', 'С печатью'],
      status: 'active',
      egrulStatus: 'ACTIVE',
      isActive: true,
    })
    .returning()

  await db.insert(companies).values({
    name: 'ПакМастер',
    slug: 'pakmaster',
    city: 'Москва',
    address: 'Москва, Варшавское ш., 1',
    website: 'https://pakmaster.example',
    descriptionRaw: 'Пакеты майка, фасовочные, с логотипом. Телефон на картах не указан.',
    status: 'unknown',
    isActive: true,
  })

  await db.insert(companies).values({
    name: 'ГофроТорг',
    slug: 'gofrotorg',
    city: 'Москва',
    address: 'Москва, промзона',
    phone: '+7 495 000-00-00',
    descriptionRaw: 'Гофротара оптом. По ЕГРЮЛ ликвидирована.',
    status: 'active',
    egrulStatus: 'LIQUIDATED',
    isActive: true,
  })

  await db.insert(companies).values({
    name: 'УпаковкаПро',
    slug: 'upakovka-pro',
    city: 'Москва',
    address: 'Москва, Зеленоград',
    phone: '+7 499 111-22-33',
    website: 'https://upakovka-pro.example',
    descriptionRaw: 'Стрейч и скотч. Уже звонили вчера.',
    status: 'active',
    egrulStatus: 'ACTIVE',
    isActive: true,
    calledAt: new Date(),
    callNote: 'Трубку взял менеджер, перезвонить',
  })

  const [megapak] = await db
    .insert(companies)
    .values({
      name: 'МегаПак',
      slug: 'megapak',
      city: 'Москва',
      address: 'Москва, Каширское ш., 10',
      phone: '+7 495 222-33-44',
      descriptionRaw: 'Упаковка для маркетплейсов. ИНН не склеился автоматически.',
      status: 'unknown',
      isActive: true,
    })
    .returning()

  await db.insert(companySources).values({
    companyId: megapak!.id,
    sourceType: 'dadata',
    payload: {
      needsReview: true,
      query: 'МегаПак Москва',
      suggestions: [
        {
          value: 'ООО МЕГАПАК',
          data: {
            inn: '7707123456',
            ogrn: '1027700123456',
            kpp: '770701001',
            okved: '17.21',
            state: { status: 'ACTIVE' },
            name: { full_with_opf: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ МЕГАПАК' },
            address: { unrestricted_value: 'г Москва, Каширское шоссе, д 10' },
          },
        },
        {
          value: 'ООО МЕГАПАК-ТОРГ',
          data: {
            inn: '7707987654',
            ogrn: '1027700987654',
            kpp: '770701001',
            okved: '46.76',
            state: { status: 'LIQUIDATED' },
            name: { full_with_opf: 'ООО МЕГАПАК-ТОРГ' },
            address: { unrestricted_value: 'г Москва' },
          },
        },
      ],
    },
  })

  await db.insert(companyClaims).values({
    companyId: alinapak!.id,
    type: 'update',
    status: 'new',
    name: 'Иван',
    position: 'менеджер',
    phone: '+7 495 123-45-67',
    email: 'ivan@alinapak.ru',
    message: 'Поменялся сайт, теперь https://new.alinapak.ru',
  })
}

console.log('demo seed done')
await pool.end()
