import { YandexMetrikaHit } from './YandexMetrikaHit'

/**
 * Яндекс.Метрика — обычный <script> в HTML, как отдаёт кабинет.
 *
 * next/script strategy=afterInteractive прятал init в RSC-payload Next
 * (`self.__next_f.push`), и браузер его не выполнял: счётчик на странице
 * «был», а визиты в кабинете оставались нулями.
 *
 * Включается `NEXT_PUBLIC_YANDEX_METRIKA_ID`. Пусто — в разметке ничего нет.
 */
export function YandexMetrika() {
  const id = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim()
  if (!id) return null
  if (!/^\d{5,12}$/.test(id)) return null

  const init = `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=${id}", "ym");
ym(${id}, "init", {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});`

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: init }} />
      <noscript>
        <div>
          <img src={`https://mc.yandex.ru/watch/${id}`} style={{ position: 'absolute', left: '-9999px' }} alt="" />
        </div>
      </noscript>
      <YandexMetrikaHit id={id} />
    </>
  )
}
