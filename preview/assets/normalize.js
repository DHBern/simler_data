/**
 * Normalisation for the search index.
 *
 * The chain is four letters and some punctuation. Pagefind's German pipeline
 * already folds the rest — measured against 1.5.2, `gruͤnet`/`gruenet`/`grunet`,
 * `erẽn`, `Zürich` and `straße` all come out as one word each, while
 * `ſüſſe`/`susse`, `herrꝛen`/`herren`, `quæ`/`quae` and `cœli`/`coeli` do not.
 * Keeping it that small is the point: Pagefind builds its result excerpts out
 * of exactly this text, so `ſüſſe Liebe` is indexed — and shown — as
 * `süsse Liebe`, not as `suesse`.
 */

/** @type {Array<[RegExp, string]>} Frequencies are from the rendered corpus. */
const LETTERS = [
  [/ſ/g, 's'], // ſ  long s        24,000×
  [/ꝛ/g, 'r'], // ꝛ  r rotunda      1,400×
  [/æ/g, 'ae'],
  [/Æ/g, 'Ae'],
  [/œ/g, 'oe'],
  [/Œ/g, 'Oe'],
  [/ſ̸|ẛ/g, 's'], // ẛ  long s with dot, for completeness
]

/**
 * Punctuation the print uses where we would not: the virgule `/` is this text's
 * comma, the apostrophe marks elision. Both must become word boundaries, or
 * `fleucht/` and `fleucht` index as different words.
 *
 * @type {Array<[RegExp, string]>}
 */
const PUNCTUATION = [
  [/[‘’‚‛]/g, "'"], // curly single quotes → straight
  [/[“”„‟]/g, '"'],
  [/[–—−]/g, '-'], // en/em dash, minus
  [/ /g, ' '], // no-break space
  [/[\/|·•]/g, ' '], // the virgule, used as a comma
]

/**
 * Normalise a string for indexing or for querying — both sides call this, or
 * the two vocabularies drift apart.
 *
 * @param {string} input
 * @returns {string}
 */
export function normalizeForSearch(input) {
  let text = input
  for (const [pattern, replacement] of LETTERS) text = text.replace(pattern, replacement)
  for (const [pattern, replacement] of PUNCTUATION) text = text.replace(pattern, replacement)
  return text.replace(/\s+/g, ' ').trim()
}

// ── the same chain, with the offsets kept ───────────────────────────────────

/**
 * Every rule, and a matcher that tells which one produced a given match.
 * `RegExp.source` is reused rather than the pattern itself, because the tables
 * carry `/g` and a shared `lastIndex` is a bug waiting for a second caller.
 *
 * @type {Array<[RegExp, string]>}
 */
const RULES = [...LETTERS, ...PUNCTUATION].map(([pattern, replacement]) => [
  new RegExp(`^(?:${pattern.source})$`),
  replacement,
])
const ANY_RULE = new RegExp([...LETTERS, ...PUNCTUATION].map(([p]) => p.source).join('|'), 'g')

/** @param {string} match @returns {string} */
function replacementFor(match) {
  for (const [pattern, replacement] of RULES) if (pattern.test(match)) return replacement
  return match // unreachable: ANY_RULE is the union of the same patterns
}

/**
 * Normalise, and record where every character came from.
 *
 * A reader arriving from a search result has to be shown the hit in the print's
 * own spelling — `süsse` was found, `ſüſſe` is on the page. `map[i]` is the
 * offset in `input` that produced `text[i]`, with one sentinel past the end so
 * that an exclusive end offset always resolves. Unlike `normalizeForSearch`
 * this does not collapse whitespace: that would change lengths for no gain.
 *
 * @param {string} input
 * @returns {{ text: string, map: number[] }}
 */
export function normalizeWithMap(input) {
  let text = ''
  /** @type {number[]} */
  const map = []
  let last = 0

  const copy = (from, to) => {
    for (let i = from; i < to; i++) {
      text += input[i]
      map.push(i)
    }
  }

  ANY_RULE.lastIndex = 0
  let match
  while ((match = ANY_RULE.exec(input)) !== null) {
    copy(last, match.index)
    for (const char of replacementFor(match[0])) {
      text += char
      map.push(match.index)
    }
    last = match.index + match[0].length
  }
  copy(last, input.length)
  map.push(input.length)

  return { text, map }
}
