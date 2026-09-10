/**
 * The HTML shell around a rendered text.
 */

import type { Entity } from './lib/entities'
import { imageBase, imageUrl, libraryRoot } from './lib/tei/iiif'
import type { RenderedNote } from './lib/tei/render'

/** One rendered document, as `build.ts` hands it over. */
export interface PreviewDoc {
  /** Source file name, e.g. `A_1648.xml`. */
  file: string
  /** Output file name, e.g. `A_1648.html`. */
  out: string
  /** `titleStmt/title`, or the file name where the header has none. */
  title: string
  html: string
  /** The same text as plain characters — what `build.ts` feeds to Pagefind. */
  text: string
  notes: RenderedNote[]
  /** `pb/@facs` in reading order: the extent of the document, and its facsimiles. */
  pages: string[]
  /** IIIF image root from the header, or null where the document names none. */
  facsRoot: string | null
  /** The register entries this document names, keyed by `rs/@key`. */
  entities: Record<string, Entity & { count: number }>
  /** What an editor should look at: unmapped elements, parse errors, ODD violations. */
  warnings: string[]
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape text and attribute values alike. */
export const esc = (value: string): string => value.replace(/[&<>"']/g, (c) => ESCAPES[c])

/**
 * The reading switches, and the `<html>` attribute each one drives.
 *
 * The values are exactly those the ODD's views key off — this table adds a
 * control surface, never a rendering rule. A new switch is one row here plus
 * one selector there. Two values make a checkbox (off, on), more a slider;
 * `auto` makes an icon button whose value, while unset, that media query decides.
 */
interface Switch { attr: string, label: string, values: string[], title?: string, auto?: string }
const SWITCHES: Switch[] = [
  {
    attr: 'normalized',
    label: 'Normalisiert',
    title: 'Zeilenenden zusammenziehen, getrennte Wörter verbinden, corr/reg/expan statt sic/orig/abbr.',
    values: ['off', 'on'],
  },
  { attr: 'entities', label: 'Entitäten', values: ['off', 'on'] },
  { attr: 'notes', label: 'Anmerkungen', values: ['off', 'quiet'] },
  { attr: 'size', label: 'Schrift', values: ['s', 'm', 'l', 'xl'] },
  { attr: 'mode', label: 'Dunkler Modus', values: ['light', 'dark'], auto: '(prefers-color-scheme: dark)' },
]

/**
 * Written onto `<html>`, so a preview is correct before any script runs.
 *
 * The print is the default, not the reading text: this is a proofing tool, and
 * what an editor compares against the facsimile is what the print says.
 */
const DEFAULTS: Record<string, string> = {
  normalized: 'off',
  entities: 'off',
  notes: 'quiet',
  size: 'm',
}

function switches(): string {
  return SWITCHES.map(({ attr, label, values, title, auto }) => {
    const at = Math.max(0, values.indexOf(DEFAULTS[attr]))
    const data = `data-switch="${attr}" data-values="${values.join(' ')}"`
    const tip = title ? ` title="${esc(title)}"` : ''
    if (auto) {
      return `<button type="button" class="icon-btn" ${data} data-auto="${esc(auto)}" aria-pressed="false"
        aria-label="${esc(label)}" title="${esc(label)}"></button>`
    }
    if (values.length > 2) {
      return `<label class="ctrl"${tip}>${esc(label)}
        <input type="range" min="0" max="${values.length - 1}" value="${at}" ${data}></label>`
    }
    return `<label class="ctrl"${tip}><input type="checkbox" ${data}${at ? ' checked' : ''}> ${esc(label)}</label>`
  }).join('')
}

function head(title: string): string {
  return `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${esc(title)} · Simler-Vorschau</title>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..700;1,400..700&family=Inter:wght@400..600&display=swap">
  <link rel="stylesheet" href="assets/preview.css">`
}

/** The corpus pages, for the bar; the page we are on is left out. */
const NAV = [['index.html', 'Übersicht'], ['search.html', 'Suche'], ['findings.html', 'Hinweise']]
const nav = (here = ''): string => NAV.filter(([href]) => href !== here)
  .map(([href, text]) => `<a class="bar-home" href="${href}">${text}</a>`).join('\n    ')

/**
 * The apparatus, as endnotes.
 */
function endnotes(notes: RenderedNote[]): string {
  const overview = notes.filter((n) => n.place === 'overview')
  const anchored = notes.filter((n) => n.place === 'end')

  const aside = overview.length === 0 ? '' : `<aside class="overview" aria-label="Überblickskommentar">
      <span class="ui-label">Überblickskommentar</span>
      ${overview.map((n) => `<div>${n.html}</div>`).join('')}
    </aside>`

  const items = anchored.map((n) => `<li class="endnote" id="${n.id}" role="doc-endnote">
          <a class="endnote-back" href="#ref-${n.id}" aria-label="Zurück zu Anmerkung ${n.number} im Text">${n.number}</a>
          <div class="endnote-body">${n.html}</div>
        </li>`).join('')

  const list = anchored.length === 0 ? '' : `<section class="endnotes" aria-labelledby="endnotes-heading">
      <h2 class="ui-label" id="endnotes-heading">Anmerkungen</h2>
      <ol>${items}</ol>
    </section>`

  return aside + list
}

/**
 * Where the hits are, for a page opened from a search result.
 *
 * Above the text, never over it: it says which hit the reader is on, moves
 * between them, and takes the marking away again. `assets/search.js` fills it
 * in; without `?q=` it stays hidden.
 */
const HIT_BANNER = `<div class="hits no-print" data-hits hidden>
      <span data-hits-text></span>
      <span data-hits-nav hidden>
        <button type="button" class="btn" data-hits-step="-1" aria-label="Vorheriger Treffer">↑</button>
        <button type="button" class="btn" data-hits-step="1" aria-label="Nächster Treffer">↓</button>
      </span>
      <button type="button" class="btn" data-hits-clear>Hervorhebung aufheben</button>
    </div>`

/**
 * The entity card — the same panel idiom as the note tooltip, one gesture.
 *
 * It holds no data: `assets/preview.js` fills it from the JSON island below,
 * keyed by the `data-key` the `rs` handler emits. No link into a register — the
 * preview has none — so the trigger stays a plain `<span>`.
 */
const ENTITY_CARD = `<aside id="entity-card" class="popover-panel no-print" popover="auto" tabindex="-1"
    aria-labelledby="entity-card-label">
    <div class="popover-head">
      <span>
        <p class="ui-label" data-card-kind></p>
        <p class="card-label" id="entity-card-label" data-card-label></p>
      </span>
      <button type="button" class="popover-close" data-popover-close aria-label="Karte schliessen"
        title="Schliessen (Esc)">×</button>
    </div>
    <div class="popover-body">
      <p data-card-detail></p>
      <p class="card-note" data-card-note></p>
      <p class="card-meta" data-card-meta></p>
    </div>
  </aside>`

/**
 * Data for one of the page's islands.
 *
 * `JSON.stringify` leaves `<` alone, so a value containing `</script>` would end
 * the block and inject the rest as markup. Escaping the three characters that
 * can start a tag closes that off; JSON string escapes are transparent to
 * `JSON.parse`.
 */
const island = (name: string, value: unknown): string =>
  `<script type="application/json" data-${name}>` +
  JSON.stringify(value).replace(/[<>&]/g, (c) => '\\u00' + c.charCodeAt(0).toString(16)) +
  `</script>`

/**
 * The card and its data. `data-entity-data`, not `data-entities`: the latter is
 * the Entitäten switch on `<html>`, which `querySelector` would find first.
 */
function entityData(doc: PreviewDoc): string {
  if (!Object.keys(doc.entities).length) return ''
  return `${island('entity-data', doc.entities)}
  ${ENTITY_CARD}`
}

/**
 * The facsimile drawer, beside the text: closed, a rail with the arrow that
 * opens it; open, the page image, resizable at its left edge.
 *
 * The `<img>` is the baseline — one IIIF JPEG, right without any script, and
 * not loaded while the drawer is closed, so it costs e-rara nothing.
 * `assets/facsimile.js` opens and sizes the drawer, upgrades the image to
 * OpenSeadragon and keeps it on the page the reader has scrolled to. Emitted
 * only where the header names a IIIF manifest.
 */
function facsimile(doc: PreviewDoc): string {
  if (!doc.facsRoot || !doc.pages.length) return ''
  const lib = libraryRoot(doc.facsRoot)
  const tool = (id: string, label: string, glyph: string) =>
    `<button type="button" class="btn" id="${id}" aria-label="${esc(label)}">${glyph}</button>`
  const paging = doc.pages.length > 1
    ? tool('osd-prev', 'Vorherige Seite', '\u2039') + tool('osd-next', 'Nächste Seite', '\u203a')
    : ''
  const toggle = (to: 'on' | 'off', label: string, cls: string) =>
    `<button type="button" class="${cls}" data-facs-toggle="${to}" aria-controls="facsimile"
      aria-expanded="${to === 'off'}" aria-label="${label}" title="${label}"></button>`

  return `<aside id="facsimile" class="facsimile no-print" aria-label="Faksimile">
    ${toggle('on', 'Faksimile einblenden', 'icon-btn facs-toggle facs-open')}
    <div class="facs-resize" data-facs-resize role="separator" aria-orientation="vertical"
      aria-label="Breite des Faksimiles" tabindex="0"></div>
    <p class="facs-caption">
      ${toggle('off', 'Faksimile ausblenden', 'icon-btn facs-toggle')}
      <span data-facs-label>Bild 1 von ${doc.pages.length}</span>
      ${lib ? `<a data-facs-link target="_blank" rel="noreferrer"
        href="${esc(lib)}/${encodeURIComponent(doc.pages[0])}">Digitalisat ↗</a>` : ''}
    </p>
    <div class="facs-frame">
      <img class="facs-image" data-facs-image loading="lazy" alt="Faksimile der aufgeschlagenen Seite"
        src="${esc(imageUrl(imageBase(doc.facsRoot, doc.pages[0])))}">
      <div class="osd-mount" data-facs-mount></div>
      <div class="facs-tools" data-facs-tools hidden>
        ${tool('osd-zoom-in', 'Vergrössern', '+')}
        ${tool('osd-zoom-out', 'Verkleinern', '\u2212')}
        ${tool('osd-home', 'Ganze Seite', '\u2921')}
        ${tool('osd-full', 'Vollbild', '\u26f6')}
        ${paging}
      </div>
    </div>
    ${island('facs-data', { root: doc.facsRoot, pages: doc.pages, library: lib })}
  </aside>`
}

/** The anchored note panel — markup only; `assets/preview.js` drives it. */
const NOTE_POPOVER = `<aside id="note-popover" class="popover-panel no-print" popover="auto" tabindex="-1"
    role="note" aria-labelledby="note-popover-title">
    <div class="popover-head">
      <p class="ui-label" id="note-popover-title" data-note-title>Anmerkung</p>
      <span class="popover-actions">
        <button type="button" class="popover-close" data-note-step="-1" aria-label="Vorherige Anmerkung">‹</button>
        <button type="button" class="popover-close" data-note-step="1" aria-label="Nächste Anmerkung">›</button>
        <button type="button" class="popover-close" data-popover-close aria-label="Anmerkung schliessen" title="Schliessen (Esc)">×</button>
      </span>
    </div>
    <div class="popover-body" data-note-body></div>
    <p class="popover-foot"><a class="btn" href="#" data-note-jump>Im Apparat anzeigen ↓</a></p>
  </aside>`

export function documentPage(doc: PreviewDoc): string {
  const drawer = facsimile(doc)
  const attrs = Object.entries({ ...DEFAULTS, ...(drawer && { facs: 'off' }) })
    .map(([k, v]) => `data-${k}="${v}"`).join(' ')
  return `<!doctype html>
<html lang="de" ${attrs}>
<head>
  ${head(doc.title)}
</head>
<body>
  <div class="topbar no-print">
    <header class="bar">
      ${nav()}
      <span class="bar-title" title="${esc(doc.file)}">${esc(doc.title)}</span>
      <div class="bar-controls">${switches()}</div>
    </header>
    ${HIT_BANNER}
  </div>
  <main id="main">
    ${doc.html}
    ${endnotes(doc.notes)}
  </main>
  ${NOTE_POPOVER}
  ${entityData(doc)}
  ${drawer}
  <script src="assets/preview.js"></script>
  ${drawer ? '<script src="assets/facsimile.js"></script>' : ''}
  <script type="module" src="assets/search.js"></script>
</body>
</html>
`
}

export function indexPage(docs: PreviewDoc[], source: string): string {
  const rows = docs.map((doc) => `<tr>
          <td><a href="${esc(encodeURI(doc.out))}">${esc(doc.title)}</a></td>
          <td class="num">${doc.pages.length || ''}</td>
          <td class="num">${doc.notes.length || ''}</td>
          <td class="num">${doc.warnings.length ? `<span class="flag">${doc.warnings.length}</span>` : ''}</td>
          <td class="file">${esc(doc.file)}</td>
        </tr>`).join('')

  return corpusPage('index.html', `Übersicht · ${docs.length} Dokumente`, `
    <p class="lead">
      Automatisch aus <code>${esc(source)}</code> gerendert.
    </p>
    <table>
      <thead>
        <tr>
          <th>Dokument</th><th class="num">Seiten</th><th class="num">Anm.</th>
          <th class="num">Hinweise</th><th>Datei</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`)
}

/**
 * The search page. Static markup and one module; Pagefind is loaded on the
 * first query, not on first paint, so the index costs a reader who came here to
 * browse nothing.
 */
export function searchPage(docs: PreviewDoc[]): string {
  return corpusPage('search.html', 'Volltextsuche', `
    <form class="search-form" data-search-form role="search">
      <input type="search" name="q" placeholder="Wort oder Wendung" aria-label="Suchbegriff"
        autocomplete="off" spellcheck="false" autofocus>
      <button type="submit" class="btn">Suchen</button>
    </form>
    <p class="lead">
      ${docs.length} Dokumente, normalisiert durchsucht: <code>ſ</code> wie <code>s</code>,
      <code>ꝛ</code> wie <code>r</code>, der Virgel <code>/</code> als Wortgrenze; Umlaute und
      übergeschriebene Zeichen faltet Pagefind selbst. Ein Treffer führt in das Dokument und
      markiert dort die Stelle.
    </p>
    <p class="status" data-search-status aria-live="polite"></p>
    <ol class="results" data-search-results></ol>
    <noscript><p class="lead">Die Suche läuft im Browser und braucht JavaScript.</p></noscript>`,
    '<script type="module" src="assets/search.js"></script>')
}

/** `2× kind: a, b` → [`kind`, `2× a, b`]: what the finding is, and where it applies. */
function splitFinding(warning: string): [string, string] {
  const [, count, rest] = /^(?:(\d+)× )?([\s\S]*)$/.exec(warning)!
  const at = rest.indexOf(': ')
  const detail = [count && `${count}×`, at < 0 ? '' : rest.slice(at + 2)].filter(Boolean)
  return [at < 0 ? rest : rest.slice(0, at), detail.join(' ')]
}

/** Every finding in the corpus, grouped by kind and largest group first: a worklist. */
export function findingsPage(docs: PreviewDoc[]): string {
  const groups = new Map<string, string[]>()
  for (const doc of docs) {
    for (const warning of doc.warnings) {
      const [kind, detail] = splitFinding(warning)
      if (!groups.has(kind)) groups.set(kind, [])
      groups.get(kind)!.push(`<tr>
          <td><a href="${esc(encodeURI(doc.out))}">${esc(doc.title)}</a></td>
          <td class="file">${esc(doc.file)}</td><td>${esc(detail)}</td>
        </tr>`)
    }
  }
  const body = [...groups]
    .sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b, 'de'))
    .map(([kind, rows]) => `<tbody>
        <tr class="group"><th colspan="3">${esc(kind)} <span class="flag">${rows.length}</span></th></tr>
        ${rows.join('')}
      </tbody>`).join('')
  const flagged = docs.filter((doc) => doc.warnings.length).length

  return corpusPage('findings.html', 'Hinweise zur Kodierung', `
    <p class="lead">
      Was beim Rendern aufgefallen ist, ${flagged} von ${docs.length} Dokumenten, nach Art geordnet.
      Kein Ersatz für die Schema-Validierung.
    </p>
    ${body ? `<table>${body}</table>` : '<p class="lead">Keine Hinweise.</p>'}`)
}

/** The frame the corpus pages share: bar, title, one column. */
function corpusPage(here: string, title: string, main: string, script = ''): string {
  return `<!doctype html>
<html lang="de" data-size="m">
<head>
  ${head(title)}
</head>
<body>
  <div class="topbar no-print"><header class="bar">
    ${nav(here)}
    <span class="bar-title">${esc(title)}</span>
  </header></div>
  <main id="main" class="index">${main}
  </main>
  ${script}
</body>
</html>
`
}
