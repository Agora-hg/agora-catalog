/**
 * Дерево категорий V0.
 *
 * Уровень 1 — 14 категорий из `Агора_поля_по_категориям_backend_расширено.xlsx` (авторы Стас/Паша),
 * взяты ТОЛЬКО названия. 226 технических характеристик из того же файла в V0 не используются:
 * V0 ищет поставщиков и обобщённо их товары, а не товары по характеристикам.
 *
 * Уровень 2 — типы продукции. Списка в файле нет; Стас привёл примеры сам
 * («целлофановые, рулон пакетов, бумажные пакеты, с принтом») — то есть список заведомо
 * шире файла и пополняется им в панели. Здесь — стартовый набор под то, что реально
 * встречается у поставщиков с Яндекс.Карт.
 *
 * `match` — ключевые слова для автомэппинга: рубрики организации с Я.Карт + название +
 * описание прогоняются по ним, чтобы не размечать 1000 компаний руками.
 * Точность ожидается 70-80%, оператор правит; is_auto в company_categories это помечает.
 */
export type CategorySeed = {
  slug: string
  name: string
  match: string[]
  children?: CategorySeed[]
}

export const CATEGORY_SEED: CategorySeed[] = [
  {
    slug: 'gofrokoroba',
    name: 'Гофрокороба',
    match: ['гофрокороб', 'гофроящик', 'короб', 'коробки', 'гофротар', 'fefco'],
    children: [
      { slug: 'chetyrehklapannye', name: 'Четырёхклапанные', match: ['четырёхклапан', 'четырехклапан', '0201'] },
      { slug: 'samosbornye', name: 'Самосборные', match: ['самосборн', 'самосборка'] },
      { slug: 'kryshka-dno', name: 'Крышка-дно', match: ['крышка-дно', 'крышка дно'] },
      { slug: 'pochtovye-korobki', name: 'Почтовые коробки', match: ['почтов'] },
      { slug: 'korobki-s-pechatyu', name: 'Коробки с печатью', match: ['с печатью', 'с логотип', 'брендированн'] },
    ],
  },
  {
    slug: 'gofrolist',
    name: 'Гофролист',
    match: ['гофролист', 'гофрокартон', 'прокладк', 'листовой картон'],
    children: [
      { slug: 'listy', name: 'Листы', match: ['лист'] },
      { slug: 'prokladki', name: 'Прокладки и заготовки', match: ['прокладк', 'заготовк'] },
    ],
  },
  {
    slug: 'strech-plenka',
    name: 'Стрейч-плёнка',
    match: ['стрейч', 'стретч', 'стрейч-плен', 'палетн'],
    children: [
      { slug: 'ruchnaya', name: 'Ручная', match: ['ручн'] },
      { slug: 'mashinnaya', name: 'Машинная', match: ['машинн'] },
      { slug: 'dzhambo', name: 'Джамбо-ролики', match: ['джамбо', 'jumbo'] },
    ],
  },
  {
    slug: 'termousadochnaya-plenka',
    name: 'Термоусадочная плёнка',
    match: ['термоусад', 'усадочн', 'поф', 'пвх плен'],
    children: [
      { slug: 'pof', name: 'ПОФ', match: ['поф'] },
      { slug: 'pvh', name: 'ПВХ', match: ['пвх'] },
      { slug: 'rukav-polurukav', name: 'Рукав и полурукав', match: ['рукав', 'полурукав'] },
    ],
  },
  {
    slug: 'vozdushno-puzyrchataya-plenka',
    name: 'Воздушно-пузырчатая плёнка',
    match: ['пузырчат', 'пупырк', 'впп', 'воздушно-пузыр'],
    children: [
      { slug: 'vpp-rulon', name: 'Рулоны', match: ['рулон'] },
      { slug: 'vpp-pakety', name: 'Пакеты из ВПП', match: ['пакет'] },
    ],
  },
  {
    slug: 'vspenennyy-polietilen',
    name: 'Вспененный полиэтилен',
    match: ['вспененн', 'изолон', 'пенополиэтилен', 'нпэ'],
    children: [
      { slug: 'npe-rulon', name: 'Рулон и лист', match: ['рулон', 'лист'] },
      { slug: 'npe-profil', name: 'Профиль', match: ['профил', 'уголок'] },
    ],
  },
  {
    slug: 'skotch',
    name: 'Упаковочный скотч',
    match: ['скотч', 'клейкая лента', 'липкая лента', 'bopp'],
    children: [
      { slug: 'skotch-ruchnoy', name: 'Ручной', match: ['ручн'] },
      { slug: 'skotch-mashinnyy', name: 'Машинный', match: ['машинн'] },
      { slug: 'skotch-s-logotipom', name: 'С логотипом', match: ['с логотип', 'печат', 'брендир'] },
      { slug: 'skotch-dvustoronniy', name: 'Двусторонний', match: ['двусторон'] },
    ],
  },
  {
    slug: 'strepping',
    name: 'Стреппинг-лента',
    match: ['стреппинг', 'обвязочн', 'полипропиленовая лента', 'стрепп'],
    children: [
      { slug: 'strepping-pp', name: 'Полипропиленовая', match: ['полипропилен', 'пп'] },
      { slug: 'strepping-pet', name: 'ПЭТ', match: ['пэт', 'pet'] },
    ],
  },
  {
    slug: 'kurerskie-i-seyf-pakety',
    name: 'Курьерские и сейф-пакеты',
    match: ['курьерск', 'сейф-пакет', 'сейф пакет', 'почтовый пакет'],
    children: [
      { slug: 'kurerskie', name: 'Курьерские пакеты', match: ['курьерск'] },
      { slug: 'seyf-pakety', name: 'Сейф-пакеты', match: ['сейф'] },
    ],
  },
  {
    slug: 'zip-lock',
    name: 'Zip-lock пакеты',
    match: ['zip', 'зип', 'струн', 'грипперы', 'гриппер'],
    children: [
      { slug: 'zip-struna', name: 'С замком-струной', match: ['струн', 'замок'] },
      { slug: 'zip-bumazhnye', name: 'Бумажные с zip', match: ['бумажн', 'крафт'] },
    ],
  },
  {
    slug: 'napolniteli',
    name: 'Наполнители',
    match: ['наполнит', 'крошка', 'бумажный наполнител', 'сизаль'],
    children: [
      { slug: 'napolnitel-bumazhnyy', name: 'Бумажный', match: ['бумажн', 'крафт'] },
      { slug: 'napolnitel-pe', name: 'Полимерный', match: ['пенопласт', 'полимерн', 'крошка'] },
    ],
  },
  {
    slug: 'termoetiketki',
    name: 'Термоэтикетки',
    match: ['термоэтикет', 'этикетк', 'самоклеящ', 'стикер', 'термотрансфер'],
    children: [
      { slug: 'eco-top', name: 'ЭКО и ТОП', match: ['эко', 'top', 'топ'] },
      { slug: 'etiketki-s-pechatyu', name: 'С печатью', match: ['с печатью', 'с логотип', 'принт'] },
    ],
  },
  {
    slug: 'pallety',
    name: 'Паллеты',
    match: ['паллет', 'палет', 'поддон', 'европоддон'],
    children: [
      { slug: 'pallety-derevo', name: 'Деревянные', match: ['деревян', 'дерево'] },
      { slug: 'pallety-plastik', name: 'Пластиковые', match: ['пластик'] },
    ],
  },
  {
    slug: 'plastikovaya-tara',
    name: 'Пластиковая тара',
    match: ['пластиковая тара', 'канистр', 'контейнер', 'ведро', 'банк', 'флакон', 'пэт-тар'],
    children: [
      { slug: 'kontejnery-dlya-edy', name: 'Контейнеры для еды', match: ['для еды', 'ланч', 'общепит'] },
      { slug: 'banki-flakony', name: 'Банки и флаконы', match: ['банк', 'флакон'] },
      { slug: 'kanistry-vedra', name: 'Канистры и ведра', match: ['канистр', 'ведр'] },
    ],
  },

  /**
   * Категории ниже в xlsx отсутствуют, но составляют существенную долю выдачи
   * «Тара и упаковка» по Москве. Без них половина спарсенных компаний окажется
   * вне фильтров, то есть невидимой. Стас может выключить их в панели (is_active),
   * но заводить их постфактум дороже, чем скрыть лишнее.
   */
  {
    slug: 'polietilenovye-pakety',
    name: 'Полиэтиленовые пакеты',
    match: ['полиэтиленов', 'пвд', 'пнд', 'майк', 'фасовочн', 'пакет'],
    children: [
      { slug: 'pakety-majka', name: 'Майка', match: ['майк'] },
      { slug: 'pakety-fasovochnye', name: 'Фасовочные', match: ['фасовочн'] },
      { slug: 'pakety-rulon', name: 'Рулон пакетов', match: ['рулон'] },
      { slug: 'pakety-s-printom', name: 'С принтом', match: ['принт', 'с логотип', 'брендир'] },
    ],
  },
  {
    slug: 'bumazhnye-pakety',
    name: 'Бумажные пакеты',
    match: ['бумажн', 'крафт-пакет', 'крафтов'],
    children: [
      { slug: 'kraft-pakety', name: 'Крафтовые', match: ['крафт'] },
      { slug: 'bumazhnye-s-ruchkami', name: 'С ручками', match: ['с ручк'] },
      { slug: 'bumazhnye-s-logotipom', name: 'С логотипом', match: ['с логотип', 'принт', 'брендир'] },
    ],
  },
  {
    slug: 'steklyannaya-tara',
    name: 'Стеклянная тара',
    match: ['стеклян', 'стекло', 'бутыл'],
    children: [
      { slug: 'butylki', name: 'Бутылки', match: ['бутыл'] },
      { slug: 'steklo-banki', name: 'Банки', match: ['банк'] },
    ],
  },
  {
    slug: 'derevyannaya-tara',
    name: 'Деревянная тара',
    match: ['деревян', 'ящик', 'обрешет'],
    children: [{ slug: 'yashchiki', name: 'Ящики', match: ['ящик'] }],
  },
  {
    slug: 'podarochnaya-upakovka',
    name: 'Подарочная упаковка',
    match: ['подарочн', 'сувенирн', 'декоративн', 'лент', 'бант'],
    children: [{ slug: 'podarochnye-korobki', name: 'Подарочные коробки', match: ['короб'] }],
  },
  {
    slug: 'odnorazovaya-posuda',
    name: 'Одноразовая посуда',
    match: ['одноразов', 'посуд', 'стакан', 'тарелк', 'приборы'],
    children: [{ slug: 'stakany', name: 'Стаканы', match: ['стакан'] }],
  },
  {
    slug: 'meshki',
    name: 'Мешки',
    match: ['мешк', 'мешок', 'полипропиленовые мешки', 'биг-бэг', 'бигбег'],
    children: [
      { slug: 'meshki-pp', name: 'Полипропиленовые', match: ['полипропилен'] },
      { slug: 'big-begi', name: 'Биг-бэги', match: ['биг-бэг', 'бигбег', 'big bag'] },
    ],
  },
  {
    slug: 'upakovochnoe-oborudovanie',
    name: 'Упаковочное оборудование',
    match: ['оборудован', 'станок', 'упаковочная машин', 'запайщик', 'диспенсер'],
  },
]
