export function Header({ active }: { active?: 'catalog' | 'requests' }) {
  return (
    <header className="header">
      <a className="skip" href="#content">
        К содержанию
      </a>
      <div className="wrap header-inner">
        <a className="logo" href="/">
          <span className="logo-mark" aria-hidden="true">
            А
          </span>
          <span>
            <span className="logo-name">Агора</span>
            <span className="logo-sub">Каталог упаковки</span>
          </span>
        </a>
        <nav className="nav" aria-label="Основное">
          <a href="/" className={active === 'catalog' ? 'is-active' : undefined}>
            Каталог
          </a>
          <a
            href="/requests"
            className={active === 'requests' ? 'is-active' : undefined}
            data-analytics="page_view"
            data-analytics-path="/requests"
          >
            Заявки
          </a>
        </nav>
        <form className="search" action="/search" method="get" role="search">
          <input
            type="search"
            name="q"
            placeholder="Компании и упаковка"
            aria-label="Поиск по компаниям и упаковке"
          />
          <button type="submit" data-analytics="search">
            Найти
          </button>
        </form>
      </div>
    </header>
  )
}
