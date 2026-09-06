import { requestsUrl } from '@/lib/config'

export function RequestForm(props: { categorySlug?: string; compact?: boolean }) {
  const action = requestsUrl()
  const ready = action.startsWith('http')
  return (
    <section className={props.compact ? 'aside' : undefined} id="request">
      <div className="panel form">
        <h2>Нужна упаковка?</h2>
        <p>Опишите запрос — оператор подберёт поставщиков в Москве. Без регистрации.</p>
        {ready ? (
          <form action={action} method="post" data-analytics="request" data-api={action}>
            <input type="hidden" name="category_slug" value={props.categorySlug ?? ''} />
            <label className="hp" aria-hidden="true">
              Не заполняйте это поле
              <input type="text" name="fax" tabIndex={-1} autoComplete="off" />
            </label>
            <label className="field">
              <span>Что нужно</span>
              <textarea
                name="description"
                required
                placeholder="Например: гофрокороб 400×300×200, тираж 3000, с печатью логотипа"
              />
            </label>
            <label className="field">
              <span>Имя</span>
              <input type="text" name="customer_name" autoComplete="name" />
            </label>
            <label className="field">
              <span>Телефон</span>
              <input type="tel" name="customer_phone" autoComplete="tel" />
            </label>
            <label className="field">
              <span>Электронная почта</span>
              <input type="email" name="customer_email" autoComplete="email" />
            </label>
            <label className="field">
              <span>Количество</span>
              <input type="text" name="quantity" placeholder="Тираж или объём" />
            </label>
            <label className="field">
              <span>Город доставки</span>
              <input type="text" name="delivery_city" defaultValue="Москва" />
            </label>
            <label className="field">
              <span>Срок</span>
              <input type="text" name="deadline" placeholder="К какой дате" />
            </label>
            <button className="btn btn-wide" type="submit">
              Отправить заявку
            </button>
            <p className="form-note">Укажите телефон или почту — чтобы ответить по заявке. Нашу почту на странице не публикуем.</p>
          </form>
        ) : (
          <p className="form-note">Приём заявок настраивается через NEXT_PUBLIC_API_URL. Форма не постится на хостинг сайта.</p>
        )}
      </div>
    </section>
  )
}
