/**
 * Render every TEI file in the corpus to a standalone HTML preview.
 *
 *     npm run build -- [--src <dir>] [--out <dir>] [name…]
 *
 * `name…` filters by substring, so proofing one text is
 * `npm run build -- A_1648` rather than a full corpus run.
 *
 * The rendering is not implemented here: the ODD (`schema/tei_simler.odd`)
 * defines it and `lib/` carries it out; this file feeds both and writes what
 * comes out, including the stylesheet the ODD compiles to.
 */

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as pagefind from 'pagefind'

import { normalizeForSearch } from './assets/normalize.js'

import { loadEntities, type Entity } from './entities'
import {
  coverage, createProcessor, idFindings, imageRoot, parse, readOdd, renderTei, type Decision,
} from './lib'
import { documentPage, findingsPage, indexPage, searchPage, type PreviewDoc } from './page'

type Processor = ReturnType<typeof createProcessor>

const here = dirname(fileURLToPath(import.meta.url))
/** The repository on GitHub, at the commit CI builds, else `main`. */
const BLOB = process.env.GITHUB_SHA
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/blob/${process.env.GITHUB_SHA}`
  : 'https://github.com/DHBern/simler_data/blob/main'
const ODD = resolve(here, '../schema/tei_simler.odd')

interface Args {
  src: string
  out: string
  /** Substrings; a file is rendered when it matches any of them. Empty = all. */
  filters: string[]
  /** Also write what the ODD decided for every element, as data. */
  records: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    src: resolve(here, '../webdav/data/sources/tei'),
    out: resolve(here, 'dist'),
    filters: [],
    records: false,
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--src') args.src = resolve(argv[++i])
    else if (argv[i] === '--out') args.out = resolve(argv[++i])
    else if (argv[i] === '--records') args.records = true
    else args.filters.push(argv[i].toLowerCase())
  }
  return args
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
  keys: string[],
  registers: Record<string, Entity>,
): { used: Record<string, Entity & { count: number }>; unknown: string[] } {
  const used: Record<string, Entity & { count: number }> = {}
  const unknown = new Set<string>()

  for (const key of keys) {
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

function render(
  file: string,
  xml: string,
  registers: Record<string, Entity>,
  processor: Processor,
  records: boolean,
): PreviewDoc & { decisions?: Decision } {
  const out = file.replace(/\.xml$/i, '.html')
  const base: PreviewDoc = {
    file, out, title: file, html: '', text: '', notes: [],
    pages: [], facsRoot: null, entities: {}, warnings: [],
  }

  // A malformed file must not take the whole corpus run down with it: it gets a
  // page saying so, and fails the run once every other page is written.
  let tree
  try {
    tree = parse(xml)
  } catch (error) {
    // The parser's message names the position and the offending tag.
    return { ...base, malformed: (error as Error).message }
  }

  // Where title, facsimile and entities come from is the ODD's `page` model.
  const result = renderTei(tree, processor, records)
  const { title = [], manifest = [], pages = [], entities: keys = [] } = result.page
  const entities = entitiesIn(keys, registers)
  const facsRoot = imageRoot(manifest[0])
  return {
    ...base,
    decisions: result.decisions,
    title: title[0] || file,
    html: result.html,
    text: result.text,
    notes: result.notes,
    pages,
    facsRoot,
    entities: entities.used,
    warnings: [
      ...idFindings(tree),
      ...tally(result.warnings),
      ...(result.unmapped.length ? [`Ohne Rendering-Regel, als Fliesstext ausgegeben: ${result.unmapped.join(', ')}`] : []),
      ...(entities.unknown.length
        ? [`rs/@key ohne Eintrag im Register: ${entities.unknown.join(', ')}`]
        : []),
      ...(!facsRoot && pages.length
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
  const { src, out, filters, records } = parseArgs(process.argv.slice(2))

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

  const odd = readOdd(await readFile(ODD, 'utf8'), await readFile(join(here, 'assets', 'tokens.css'), 'utf8'))
  await writeFile(join(out, 'assets', 'odd.css'), odd.css)
  const processor = createProcessor(odd)

  if (records) await mkdir(join(out, 'records'), { recursive: true })

  const docs: PreviewDoc[] = []
  for (const name of names) {
    // The decisions are written and dropped; keeping 74 of these trees is not worth the memory.
    const { decisions, ...doc } = render(name, await readFile(join(src, name), 'utf8'), registers, processor, records)
    await writeFile(join(out, doc.out), documentPage(doc, odd.views))
    if (decisions) {
      const json = JSON.stringify({ document: name, output: 'web', root: decisions })
      await writeFile(join(out, 'records', name.replace(/\.xml$/i, '.json')), json)
    }
    docs.push(doc)
    if (doc.malformed) console.error(`  ${name}: XML nicht wohlgeformt: ${doc.malformed}`)
    for (const warning of doc.warnings) console.warn(`  ${name}: ${warning}`)
  }

  const source = relative(resolve(here, '..'), src).replaceAll('\\', '/')
  await writeFile(join(out, 'index.html'), indexPage(docs, source, source.startsWith('..') ? null : `${BLOB}/${source}`))
  await writeFile(join(out, 'search.html'), searchPage(docs))
  const gaps = coverage(odd)
  await writeFile(join(out, 'findings.html'), findingsPage(docs, [...odd.findings], gaps))
  await buildIndex(docs, out)

  const named = new Set(docs.flatMap((doc) => Object.keys(doc.entities)))
  console.log(`Register: ${Object.keys(registers).length} Einträge, ${named.size} im Korpus genannt.`)

  const flagged = docs.filter((d) => d.warnings.length).length
  const malformed = docs.filter((d) => d.malformed).length
  const unread = malformed ? `, ${malformed} nicht wohlgeformt` : ''
  console.log(`${docs.length} Dokumente gerendert nach ${out} (${flagged} mit Hinweisen${unread}).`)
  console.log(`ODD: ${odd.reached.models.size} Modelle haben gegriffen, ${gaps.length} Lücke(n) — siehe findings.html.`)
  if (records) console.log(`Entscheidungen der ODD: ${out}/records.`)

  // The corpus is rendered whatever the ODD says; a flaw in the ODD still fails the run, since
  // every page was rendered without what it asked for. So does a document with no text to render.
  if (odd.findings.size) {
    for (const finding of odd.findings) console.error(`  ODD: ${finding}`)
    console.error(`ODD: ${odd.findings.size} Befund(e) — siehe findings.html.`)
    process.exitCode = 1
  }
  if (malformed) {
    console.error(`${malformed} Dokument(e) nicht wohlgeformt, ohne Text — siehe findings.html.`)
    process.exitCode = 1
  }
  if (filters.length) console.log('Gefilterter Lauf: index.html führt nur diese Dokumente auf.')
}

await main()
