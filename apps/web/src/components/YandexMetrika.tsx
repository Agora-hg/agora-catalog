import Script from 'next/script'
import { YandexMetrikaHit } from './YandexMetrikaHit'

/**
 * Яндекс.Метрика.
 *
 * Включается переменной `NEXT_PUBLIC_YANDEX_METRIKA_ID`. Пусто — счётчик
 * не подключается вообще, ни строчки в разметке.
 *
 * Почему `afterInteractive`: счётчик не должен задерживать первую отрисовку.
 * Страницы каталога отдаются готовым HTML ради поисковиков, и вешать в критический
 * путь чужой скрипт значит портить то, ради чего всё делалось.
 *
 * `ssr:true` — как в коде, который отдаёт кабинет Метрики для SSR-сайтов.
 * Без него первый просмотр на серверном HTML иногда теряется.
 *
 * `webvisor` включён: для каталога полезно видеть, как человек ходит по фильтрам
 * и на чём останавливается. Это же и единственный способ понять, почему заявку
 * не оставили.
 *
 * Метрика НЕ заменяет наш собственный сбор событий: он привязан к конкретным
 * компаниям (`company_id`) и остаётся у нас в базе, то есть годится как лист
 * для продаж. Метрика отвечает на другой вопрос — откуда пришли и что смотрели.
 */
export function YandexMetrika() {
  const id = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim()
  if (!id) return null
  if (!/^\d{5,12}$/.test(id)) return null

  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`
          (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
          m[i].l=1*new Date();
          for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
          k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
          (window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=${id}", "ym");
          ym(${id}, "init", {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
        `}
      </Script>
      {/* Резерв для посетителей с выключенным JS: без него Метрика их не увидит. */}
      <noscript>
        <div>
          <img src={`https://mc.yandex.ru/watch/${id}`} style={{ position: 'absolute', left: '-9999px' }} alt="" />
        </div>
      </noscript>
      <YandexMetrikaHit id={id} />
    </>
  )
}
