/**
 * Render every TEI file in the corpus to a standalone HTML preview.
 *
 *     npm run build -- [--src <dir>] [--out <dir>] [name…]
 *
 * `name…` filters by substring, so proofing one text is
 * `npm run build -- A_1648` rather than a full corpus run.
 *
 * The rendering itself is not implemented here: `lib/` is the edition's
 * pipeline, and this file only feeds it and writes what comes out.
 */

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as pagefind from 'pagefind'
import { fromXml } from 'xast-util-from-xml'

import { normalizeForSearch } from './assets/normalize.js'

import { loadEntities, type Entity } from './lib/entities'
import { handlers } from './lib/tei/handlers'
import { imageRoot } from './lib/tei/iiif'
import { renderTei } from './lib/tei/render'
import { attr, children, findAll, findFirst, isElement, localName, plainText, type Nodes } from './lib/tei/xast'
import { documentPage, findingsPage, indexPage, searchPage, type PreviewDoc } from './page'

const here = dirname(fileURLToPath(import.meta.url))

interface Args {
  src: string
  out: string
  /** Substrings; a file is rendered when it matches any of them. Empty = all. */
  filters: string[]
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    src: resolve(here, '../webdav/data/sources/tei'),
    out: resolve(here, 'dist'),
    filters: [],
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--src') args.src = resolve(argv[++i])
    else if (argv[i] === '--out') args.out = resolve(argv[++i])
    else args.filters.push(argv[i].toLowerCase())
  }
  return args
}

/**
 * TEI elements in the text section that the handler map has no entry for.
 *
 * They still render — `handlers['*']` emits a transparent span rather than
 * swallowing them — but an editor using a new element deserves to be told that
 * the presentation layer does not know it yet. `<teiHeader>` is skipped, as
 * `dropHeader` skips it: metadata is not running text.
 */
function unmapped(tree: Nodes, seen = new Set<string>()): Set<string> {
  for (const child of children(tree)) {
    if (!isElement(child)) continue
    const name = localName(child.name)
    if (name === 'teiHeader') continue
    if (!(name in handlers)) seen.add(name)
    unmapped(child, seen)
  }
  return seen
}

/** `a`, `a`, `b` → `b`, `2× a`: the same finding twenty times is one finding. */
function tally(warnings: string[]): string[] {
  const counts = new Map<string, number>()
  for (const warning of warnings) counts.set(warning, (counts.get(warning) ?? 0) + 1)
  return [...counts].map(([warning, n]) => (n > 1 ? `${n}× ${warning}` : warning))
}

/**
 * The entities this document names, with how often — the card's own page data.
 */
function entitiesIn(
  tree: Nodes,
  registers: Record<string, Entity>,
): { used: Record<string, Entity & { count: number }>; unknown: string[] } {
  const used: Record<string, Entity & { count: number }> = {}
  const unknown = new Set<string>()

  for (const rs of findAll(tree, 'rs')) {
    const key = attr(rs, 'key')
    if (!key) continue
    if (used[key]) {
      used[key].count++
    } else if (registers[key]) {
      used[key] = { ...registers[key], count: 1 }
    } else {
      unknown.add(key)
    }
  }
  return { used, unknown: [...unknown].sort() }
}

/** `titleStmt/title`, the one piece of the header a preview needs. */
function titleOf(tree: Nodes): string {
  const titleStmt = findFirst(tree, 'titleStmt')
  return titleStmt ? plainText(findFirst(titleStmt, 'title')) : ''
}

/** The IIIF manifest, `<idno type="URLIIIF">` — where the facsimiles live. */
function manifestOf(tree: Nodes): string | null {
  for (const idno of findAll(tree, 'idno')) {
    if (attr(idno, 'type') === 'URLIIIF') return plainText(idno).trim() || null
  }
  return null
}

function render(file: string, xml: string, registers: Record<string, Entity>): PreviewDoc {
  const out = file.replace(/\.xml$/i, '.html')
  const base: PreviewDoc = {
    file, out, title: file, html: '', text: '', notes: [],
    pages: [], facsRoot: null, entities: {}, warnings: [],
  }

  // A malformed file must not take the whole corpus run down with it: it gets a
  // page saying so, and the index flags it like any other finding.
  let tree
  try {
    tree = fromXml(xml)
  } catch (error) {
    // The parser's own message is generic; the position and the offending tag
    // are in the cause, which is the only part an editor can act on.
    const { cause, message } = error as Error & { cause?: Error }
    return { ...base, warnings: [`XML nicht wohlgeformt: ${cause?.message ?? message}`] }
  }

  const result = renderTei(xml)
  const unknown = [...unmapped(tree)].sort()
  const entities = entitiesIn(tree, registers)
  const facsRoot = imageRoot(manifestOf(tree))
  return {
    ...base,
    title: titleOf(tree) || file,
    html: result.html,
    text: result.text,
    notes: result.notes,
    pages: result.pages,
    facsRoot,
    entities: entities.used,
    warnings: [
      ...tally(result.warnings),
      ...(unknown.length ? [`Ohne Rendering-Regel, als Fliesstext ausgegeben: ${unknown.join(', ')}`] : []),
      ...(entities.unknown.length
        ? [`rs/@key ohne Eintrag im Register: ${entities.unknown.join(', ')}`]
        : []),
      ...(!facsRoot && result.pages.length
        ? ['Kein <idno type="URLIIIF"> im Header — die Seite zeigt kein Faksimile']
        : []),
    ],
  }
}

/**
 * The Pagefind index, built from the rendered text rather than by crawling the
 * pages.
 */
async function buildIndex(docs: PreviewDoc[], out: string) {
  const { index, errors } = await pagefind.createIndex({ forceLanguage: 'de' })
  if (!index) throw new Error(`Suchindex: ${errors.join(', ')}`)

  let indexed = 0
  for (const doc of docs) {
    const content = normalizeForSearch(doc.text)
    if (!content) continue // a document that failed to render has no words
    const { errors: addErrors } = await index.addCustomRecord({
      url: encodeURI(doc.out),
      content,
      language: 'de',
      meta: { title: doc.title, file: doc.file },
    })
    if (addErrors?.length) throw new Error(`Suchindex, ${doc.file}: ${addErrors.join(', ')}`)
    indexed++
  }

  const { errors: writeErrors } = await index.writeFiles({ outputPath: join(out, 'pagefind') })
  if (writeErrors?.length) throw new Error(`Suchindex schreiben: ${writeErrors.join(', ')}`)
  await pagefind.close()

  const words = docs.reduce((n, doc) => n + (doc.text ? doc.text.split(' ').length : 0), 0)
  console.log(`Suchindex: ${indexed} Dokumente, ~${words.toLocaleString('de-CH')} Wörter.`)
}

async function main() {
  const { src, out, filters } = parseArgs(process.argv.slice(2))

  const names = (await readdir(src))
    .filter((name) => name.toLowerCase().endsWith('.xml'))
    .filter((name) => !filters.length || filters.some((f) => name.toLowerCase().includes(f)))
    .sort((a, b) => a.localeCompare(b, 'de'))

  if (!names.length) throw new Error(`Keine passende TEI-Datei in ${src}`)

  await mkdir(out, { recursive: true })
  // A full run starts from an empty directory, so a renamed or deleted source
  // leaves no orphan behind. A filtered one must not: proofing one poem may not
  // delete the previews already sitting there.
  if (!filters.length) {
    for (const entry of await readdir(out)) await rm(join(out, entry), { recursive: true, force: true })
  }
  await cp(join(here, 'assets'), join(out, 'assets'), { recursive: true })
  // OpenSeadragon is a plain browser build, vendored rather than bundled: the
  // facsimile panel loads it on demand and nothing else needs it.
  await mkdir(join(out, 'assets', 'vendor'), { recursive: true })
  await cp(
    resolve(here, 'node_modules/openseadragon/build/openseadragon/openseadragon.min.js'),
    join(out, 'assets', 'vendor', 'openseadragon.min.js'),
  )
  await writeFile(join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n')

  const registers = await loadEntities(resolve(here, '../gsheet/csv'))
  if (!Object.keys(registers).length) {
    console.warn('  Keine Registerdaten in gsheet/csv — Entitäten bleiben ohne Karte.')
  }

  const docs: PreviewDoc[] = []
  for (const name of names) {
    const doc = render(name, await readFile(join(src, name), 'utf8'), registers)
    await writeFile(join(out, doc.out), documentPage(doc))
    docs.push(doc)
    for (const warning of doc.warnings) console.warn(`  ${name}: ${warning}`)
  }

  await writeFile(join(out, 'index.html'), indexPage(docs, 'webdav/data/sources/tei'))
  await writeFile(join(out, 'search.html'), searchPage(docs))
  await writeFile(join(out, 'findings.html'), findingsPage(docs))
  await buildIndex(docs, out)

  const named = new Set(docs.flatMap((doc) => Object.keys(doc.entities)))
  console.log(`Register: ${Object.keys(registers).length} Einträge, ${named.size} im Korpus genannt.`)

  const flagged = docs.filter((d) => d.warnings.length).length
  console.log(`${docs.length} Dokumente gerendert nach ${out} (${flagged} mit Hinweisen).`)
  if (filters.length) console.log('Gefilterter Lauf: index.html führt nur diese Dokumente auf.')
}

await main()
