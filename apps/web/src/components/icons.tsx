/**
 * Иконки набора Lucide, вшитые как inline-SVG.
 *
 * Почему не эмодзи и не символы вроде «✓» и «⌖»: они зависят от шрифта системы,
 * на части машин рисуются цветной картинкой, не наследуют цвет текста и
 * произвольно меняют размер. Чек-лист дизайн-системы прямо это запрещает.
 *
 * Почему inline, а не библиотека: три иконки не стоят зависимости в бандле,
 * а SSR-разметка должна содержать их сразу — страницы читает поисковик.
 */

type Props = { size?: number; className?: string }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
})

/** Метка на карте — рядом с адресом. */
export function IconPin({ size = 14, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

/** Галочка в круге — компания проверена вручную. */
export function IconVerified({ size = 16, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

/** Простая галочка — строка «информация проверена» и список преимуществ. */
export function IconCheck({ size = 14, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/** Стрелка наружу — переход на сайт поставщика. */
export function IconExternal({ size = 14, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  )
}
