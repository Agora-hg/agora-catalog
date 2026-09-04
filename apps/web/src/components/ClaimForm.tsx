import { claimsUrl } from '@/lib/config'

export function ClaimForm({ slug }: { slug: string }) {
  const action = claimsUrl(slug)
  const ready = action.startsWith('http')
  return (
    <section id="claim" className="panel form" style={{ marginTop: '1rem' }}>
      <h2>Вы представитель этой компании?</h2>
      <p>Сообщить об ошибке / обновить информацию. Проверяем вручную.</p>
      {ready ? (
        <form action={action} method="post" data-analytics="claim" data-api={action}>
          <label className="hp" aria-hidden="true">
            Не заполняйте это поле
            <input type="text" name="fax" tabIndex={-1} autoComplete="off" />
          </label>
          <label className="field">
            <span>Тип обращения</span>
            <select name="type" defaultValue="update">
              <option value="update">Обновить информацию</option>
              <option value="add_info">Добавить данные</option>
              <option value="verify">Подтвердить карточку</option>
              <option value="delete">Удалить карточку</option>
            </select>
          </label>
          <label className="field">
            <span>Имя</span>
            <input type="text" name="name" autoComplete="name" />
          </label>
          <label className="field">
            <span>Должность</span>
            <input type="text" name="position" />
          </label>
          <label className="field">
            <span>Телефон</span>
            <input type="tel" name="phone" autoComplete="tel" />
          </label>
          <label className="field">
            <span>Электронная почта</span>
            <input type="email" name="email" autoComplete="email" />
          </label>
          <label className="field">
            <span>Сообщение</span>
            <textarea name="message" required placeholder="Что исправить или добавить" />
          </label>
          <button className="btn" type="submit">
            Отправить
          </button>
        </form>
      ) : (
        <p className="form-note">Форма обращения появится, когда задан NEXT_PUBLIC_API_URL.</p>
      )}
    </section>
  )
}
