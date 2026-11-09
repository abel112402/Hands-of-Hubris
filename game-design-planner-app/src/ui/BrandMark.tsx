/**
 * The app's glyph: an isometric design block (a building block / die) in the brand colour.
 * Same drawing as public/favicon.svg. Decorative: the brand name next to it carries the label.
 */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M16 3.5 27 9.75v12.5L16 28.5 5 22.25V9.75Z" fill="var(--brand-strong, #c97f17)" />
      <path d="M16 3.5 27 9.75 16 16 5 9.75Z" fill="var(--brand, #f2a541)" />
      <path d="M16 16v12.5L5 22.25V9.75Z" fill="#8a5a12" />
      <circle cx="10.5" cy="19" r="1.7" fill="var(--brand, #f2a541)" />
      <path d="M16 16v12.5M5 9.75 16 16l11-6.25" fill="none" stroke="#111316" strokeOpacity=".35" strokeWidth="1" />
    </svg>
  )
}
