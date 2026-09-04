export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <span>© {year} Агора — каталог поставщиков упаковки в Москве</span>
        <a href="/">Каталог</a>
      </div>
    </footer>
  )
}
