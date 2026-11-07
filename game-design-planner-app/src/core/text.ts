/**
 * English count wording for text that is not translated (module labels, Markdown export,
 * view captions). Translated UI text uses i18next `_one` / `_other` keys instead.
 */

/** English plural of a noun or noun phrase; only the last word changes. */
export function pluralize(word: string): string {
  const m = word.match(/^(.*?)(\w+)([^\w]*)$/)
  if (!m) return word
  const [, head, last, tail] = m
  let out: string
  if (/[^aeiou]y$/i.test(last)) out = last.slice(0, -1) + 'ies'
  else if (/(s|x|z|ch|sh)$/i.test(last)) out = last + 'es'
  else out = last + 's'
  return head + out + tail
}

/** "1 phase", "7 phases"; pass `plural` for irregular nouns. Non-integer counts read as plural. */
export function countOf(n: number | string, singular: string, plural?: string): string {
  return `${n} ${Number(n) === 1 ? singular : (plural ?? pluralize(singular))}`
}
