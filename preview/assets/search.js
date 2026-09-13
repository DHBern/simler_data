/**
 * The search.
 */

import { normalizeForSearch, normalizeWithMap } from './normalize.js'

const WORD = /[\p{L}\p{N}]/u

// ── arriving on a page with ?q= ─────────────────────────────────────────────

/**
 * What Pagefind's German pipeline folds and `normalize.js` therefore does not.
 *
 * The indexed text stays readable, because result excerpts are built out of it;
 * matching *in the page* has no such constraint and must fold everything the
 * index folded, or a reader who searched `grünet` arrives on a page carrying
 * `gruͤnet` and sees nothing marked. Character by character, so the offsets
 * from `normalizeWithMap` survive.
 */
function fold(input, map) {
  const source = (i) => (map ? map[i] : i)
  let text = ''
  const folded = []
  for (let i = 0; i < input.length; i++) {
    const replacement = input[i] === 'ß' ? 'ss' : input[i].normalize('NFD').replace(/\p{M}/gu, '')
    for (const char of replacement) {
      text += char
      folded.push(source(i))
    }
  }
  folded.push(source(input.length))
  return { text: text.toLowerCase(), map: folded }
}

/** Words worth marking: normalised, folded, lowercased, de-duplicated. */
function queryWords(query) {
  const words = fold(normalizeForSearch(query.replace(/["']/g, ' ')))
    .text.split(/\s+/)
    .filter((word) => word.length > 1)
  return [...new Set(words)]
}

/** Where the words occur in one text, in its own coordinates. */
function rangesIn(value, words) {
  const normalized = normalizeWithMap(value)
  const { text: haystack, map } = fold(normalized.text, normalized.map)
  const ranges = []

  for (const word of words) {
    let from = 0
    for (;;) {
      const at = haystack.indexOf(word, from)
      if (at < 0) break
      from = at + word.length
      // Only from a word boundary: `liebe` marks *Liebende*, never the middle
      // of *verlieben*. Pagefind stems and we cannot — marking less than the
      // index found is honest, marking the wrong word would not be.
      if (at > 0 && WORD.test(haystack[at - 1])) continue
      ranges.push([map[at], Math.max(map[from], map[from - 1] + 1)])
    }
  }

  // Two query words can hit the same characters; merge before splitting nodes.
  ranges.sort((a, b) => a[0] - b[0])
  const merged = []
  for (const range of ranges) {
    const previous = merged[merged.length - 1]
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1])
    else merged.push([...range])
  }
  return merged
}

/** Replace one text node with the same text, each piece wrapped in a `<mark>` of its hit. */
function markNode(node, pieces) {
  const value = node.data
  const fragment = document.createDocumentFragment()
  let at = 0
  for (const [start, end, hit] of pieces) {
    if (start > at) fragment.append(value.slice(at, start))
    const mark = document.createElement('mark')
    mark.className = 'search-hit'
    mark.textContent = value.slice(start, end)
    fragment.append(mark)
    hit.push(mark)
    at = end
  }
  if (at < value.length) fragment.append(value.slice(at))
  node.replaceWith(fragment)
}

/** An element that ends a word: anything but phrasing markup, or a block the renderer set as a span. */
const BLOCK = ':not(span, a, mark), .pm-block'

/**
 * The visible text of `root` as runs a word can span: across `<hi>`, a range or a
 * joined line end, but not across a block or a line break.
 */
function textRuns(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  const runs = []
  let run = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'BR' && node.checkVisibility() && !node.closest('.plain-omit')) run = null
      continue
    }
    const parent = node.parentElement
    // What the index leaves out (a page-break label, the brackets of a supplement) is not
    // searched here either. Both readings of a `<choice>` are in the DOM; the view hides one.
    if (parent.closest('.plain-omit') || !parent.checkVisibility()) continue
    const block = parent.closest(BLOCK)
    if (!run || run.block !== block) runs.push((run = { block, text: '', nodes: [] }))
    run.nodes.push([node, run.text.length])
    run.text += node.data
  }
  return runs
}

/** Mark every occurrence of `query` inside `root`; the hits in document order, each its marks. */
function markQuery(root, query) {
  const words = queryWords(query)
  if (!words.length) return []

  // Collected first, because marking rewrites the tree the walker is walking.
  const hits = []
  const pieces = new Map()
  for (const run of textRuns(root)) {
    for (const [start, end] of rangesIn(run.text, words)) {
      const hit = []
      hits.push(hit)
      for (const [node, offset] of run.nodes) {
        const from = Math.max(start - offset, 0)
        const to = Math.min(end - offset, node.data.length)
        if (from < to) pieces.set(node, [...(pieces.get(node) ?? []), [from, to, hit]])
      }
    }
  }
  for (const [node, list] of pieces) markNode(node, list)
  return hits
}

/**
 * `?q=` on a document page: mark the hits, say how many, step between them. A
 * result that hands the reader a five-hundred-page volume and leaves them to
 * find the word in it is not a result.
 */
function setUpHighlight() {
  const url = new URL(location.href)
  const query = url.searchParams.get('q')?.trim()
  const text = document.querySelector('.tei-text')
  const banner = document.querySelector('[data-hits]')
  if (!query || !text || !banner) return

  const label = banner.querySelector('[data-hits-text]')
  const nav = banner.querySelector('[data-hits-nav]')
  const clear = banner.querySelector('[data-hits-clear]')
  const hits = markQuery(text, query)
  let at = 0

  function go(index) {
    if (!hits.length) return
    at = (index + hits.length) % hits.length
    hits.forEach((hit, i) => hit.forEach((mark) => mark.classList.toggle('is-current', i === at)))
    label.textContent =
      `Treffer ${at + 1} von ${hits.length} für „${query}“${label.dataset.keys ?? ''}`
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    hits[at][0].scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' })
  }

  if (hits.length) {
    nav.hidden = hits.length < 2
    if (hits.length > 1) label.dataset.keys = ' · n / N'
    go(0)
  } else {
    // Not an error, and worth saying: the index stems, the page cannot. The hit
    // is on this page, just not in this form of the word.
    label.textContent =
      `Für „${query}“ ist hier keine Stelle markiert — gesucht wird mit Wortformen, ` +
      'der Druck kann eine andere führen.'
    clear.textContent = 'Hinweis schliessen'
  }
  banner.hidden = false

  nav.addEventListener('click', (event) => {
    const step = event.target.closest('[data-hits-step]')
    if (step) go(at + Number(step.dataset.hitsStep))
  })
  // The browser's own find keys, without the modifier: stepping through eight
  // hits should not mean returning to the bar for each one.
  document.addEventListener('keydown', (event) => {
    if (banner.hidden || hits.length < 2 || event.metaKey || event.ctrlKey || event.altKey) return
    const active = document.activeElement
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
    if (event.key === 'n') go(at + 1)
    else if (event.key === 'N') go(at - 1)
    else return
    event.preventDefault()
  })

  clear.addEventListener('click', () => {
    for (const mark of text.querySelectorAll('mark.search-hit')) mark.replaceWith(...mark.childNodes)
    text.normalize()
    banner.hidden = true
    // The parameter goes too, so a reload — or a bookmark taken here — shows the
    // page rather than the search that led to it.
    url.searchParams.delete('q')
    history.replaceState(null, '', url)
  })
}

// ── the search page ─────────────────────────────────────────────────────────

async function setUpSearch() {
  const form = document.querySelector('[data-search-form]')
  if (!form) return
  const input = form.querySelector('input[name=q]')
  const status = document.querySelector('[data-search-status]')
  const list = document.querySelector('[data-search-results]')

  let api = null
  async function load() {
    if (api) return api
    // The index only exists after a build, and never over `file://`.
    // `../`: this module is served from `assets/`, the index sits beside it at
    // the root of `dist/`.
    api = await import('../pagefind/pagefind.js').catch(() => null)
    if (!api) {
      status.textContent =
        'Der Suchindex ist nicht erreichbar. Er entsteht beim Build — und die Suche ' +
        'braucht einen Server: über file:// lädt der Browser keine Module.'
      return null
    }
    await api.options({ excerptLength: 30 })
    return api
  }

  async function run(query) {
    list.replaceChildren()
    if (!query) {
      status.textContent = ''
      return
    }
    const pagefind = await load()
    if (!pagefind) return

    status.textContent = 'Suche läuft …'
    // Both sides of the search run the same normalisation, or the reader's
    // words and the indexed ones are not the same vocabulary.
    const { results } = await pagefind.search(normalizeForSearch(query))
    const found = await Promise.all(results.slice(0, 30).map((result) => result.data()))

    status.textContent = results.length
      ? `${results.length} Dokument${results.length === 1 ? '' : 'e'}` +
        (results.length > found.length ? `, die ersten ${found.length} gezeigt` : '')
      : `Nichts gefunden für „${query}“.`

    list.append(
      ...found.map((item) => {
        const li = document.createElement('li')
        const link = document.createElement('a')
        // `?q=` is what makes the result land *on the word* rather than at the
        // top of a volume — `setUpHighlight` picks it up on the other side.
        link.href = `${item.url}?q=${encodeURIComponent(query)}`
        link.textContent = item.meta.title || item.url
        const excerpt = document.createElement('p')
        excerpt.className = 'excerpt'
        excerpt.innerHTML = item.excerpt // Pagefind's own <mark>s, nothing else
        const file = document.createElement('span')
        file.className = 'file'
        file.textContent = item.meta.file ?? ''
        li.append(link, excerpt, file)
        return li
      }),
    )
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const query = input.value.trim()
    // The query lives in the URL, so a search can be linked to and reloaded.
    history.replaceState(null, '', query ? `?q=${encodeURIComponent(query)}` : location.pathname)
    run(query)
  })

  const initial = new URL(location.href).searchParams.get('q')?.trim()
  if (initial) {
    input.value = initial
    run(initial)
  }
}

setUpHighlight()
setUpSearch()
