/**
 * What the synopsis must not lose: which words vary, which reading answers
 * which across the witnesses, and the difference between a witness that has
 * nothing here and one whose cell repeats an earlier segment.
 *
 *     node --import tsx --test test/synopsis.test.ts
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { CATEGORIES, loadSynopses, numberLines, SETTINGS, STEPS } from '../alignments'
import { findingsPage } from '../page'
import { synopsesPage, synopsisHref, synopsisPage } from '../synopsis'

/**
 * An Alignment JSON document, as `alignment/pipeline.py` writes them. A row
 * gives each witness its readings column by column (`''`: a gap there), or
 * null where the witness has no text, and the relations of its columns.
 */
interface Row {
  cells: Record<string, string[] | null>
  head?: boolean
  copy?: Record<string, string>
  refs?: Record<string, string[]>
  relations?: Record<number, object>
}

/** A type the pipeline's rule step wrote. */
const rule = (type: string, name: string) => ({ type, by: 'rule', rule: name })

function alignment(sources: Record<string, string>, rows: Row[], meta: object = {}) {
  const witnesses = Object.entries(sources).map(([siglum, source]) => ({ siglum, name: siglum, source, tokens: [] as { t: string }[] }))
  const segments = rows.map((row, i) => {
    const cells: Record<string, object> = {}
    const columns: { spans: Record<string, [number, number]>, relation?: object }[] = []
    for (const w of witnesses) {
      const readings = row.cells[w.siglum]
      if (!readings) {
        cells[w.siglum] = { missing: true }
        continue
      }
      const start = w.tokens.length
      readings.forEach((text, c) => {
        if (!text) return
        if (w.tokens.length > start) w.tokens.push({ t: ' ' })
        ;(columns[c] ??= { spans: {} }).spans[w.siglum] = [w.tokens.length, w.tokens.length + 1]
        w.tokens.push({ t: text })
      })
      cells[w.siglum] = { span: [start, w.tokens.length], ...(row.copy?.[w.siglum] ? { copy_of: row.copy[w.siglum] } : {}) }
    }
    for (const [c, relation] of Object.entries(row.relations ?? {})) columns[Number(c)].relation = relation
    const roles = row.head ? Object.fromEntries(Object.keys(sources).filter((s) => row.cells[s]).map((s) => [s, 'head'])) : {}
    return { id: `s${i + 1}`, number: i + 1, roles, cells, columns, ...(row.refs ? { refs: row.refs } : {}) }
  })
  return { format: 'alignment-json', format_version: '1.0', meta, settings: { filters: [] }, witnesses, segments }
}

const EXPORT = alignment({ A: 'tei/A_1648.xml#n69', F42A: 'tei/F42A.xml#n69' }, [
  { cells: { A: ['Liebgedicht'], F42A: null }, head: true },
  { cells: { A: ['ich', 'nimmermehr'], F42A: ['ich', 'glaube'] }, copy: { F42A: 's1' },
    refs: { A: ['A-l0001'], F42A: ['F42A-l0001'] } },
  { cells: { A: ['auff', 'Gott'], F42A: ['auf', 'Gott'] }, refs: { A: ['A-l0002'], F42A: ['F42A-l0002'] },
    relations: { 0: rule('spelling', 'doubled letters') } },
], {
  created_at: '2026-09-28T19:00:00.000+02:00', updated_at: '2026-09-29T02:10:44.000+02:00',
  align_algorithm: 'cgsa',
})

/** A bundle: two poems in one alignment, as `n1` holds 41 psalms. */
const BUNDLE = alignment({ A: 'tei/A_1648.xml#n7', B: 'tei/B_1653.xml#n7' }, [1, 2, 3, 4].map((n) => {
  const words = n % 2 ? ['Psalm', String(n)] : ['ein', 'vers']
  return { cells: { A: words, B: words }, head: n % 2 === 1 }
}))

async function load() {
  const dir = await mkdtemp(join(tmpdir(), 'synopsis-'))
  await writeFile(join(dir, 'n69.json'), JSON.stringify(EXPORT), 'utf8')
  // The machine's alignment of the same poem sits beside it and is not a synopsis.
  await writeFile(join(dir, 'n69.auto.json'), JSON.stringify(EXPORT), 'utf8')

  // Beside it, what the alignment was made from: where each line stands in the
  // print. A witness without one simply gets no link.
  const imports = join(dir, 'lines')
  await mkdir(imports, { recursive: true })
  await writeFile(join(imports, 'n69-A_1648.csv'), 'id,line\nA-l0001,1\nA-l0002,3\n', 'utf8')
  return loadSynopses(dir, imports)
}

async function loadBundle() {
  const dir = await mkdtemp(join(tmpdir(), 'bundle-'))
  await writeFile(join(dir, 'n7.json'), JSON.stringify(BUNDLE), 'utf8')
  return (await loadSynopses(dir))[0]
}

test('a poem is read once, with its title, witnesses and variants', async () => {
  const [synopsis, ...rest] = await load()
  assert.equal(rest.length, 0)
  assert.equal(synopsis.id, 'n69')
  assert.equal(synopsis.title, 'Liebgedicht') // the head segment names the poem
  assert.deepEqual(synopsis.witnesses.map((w) => w.siglum), ['A', 'F42A'])
  assert.equal(synopsis.witnesses[0].href, 'A_1648.html#n69') // back to the text it came from
  assert.equal(synopsis.variants, 2) // one wording, one spelling
})

test('words that vary keep the id that pairs them across witnesses', async () => {
  const [synopsis] = await load()
  const cells = synopsis.segments[1].cells
  assert.deepEqual(cells.A.map((run) => [run.text, run.group]),
    [['ich ', null], ['nimmermehr', '2-2']])
  // The same id in the other column is what lets the page mark the pair.
  assert.equal(cells.F42A.find((run) => run.group === '2-2')?.text, 'glaube')
})

test('a missing witness and a copied cell are told apart on the page', async () => {
  const [synopsis] = await load()
  const page = synopsisPage(synopsis)
  assert.match(page, /<td class="gap" data-w="2" title="fehlt">/)
  assert.match(page, /<td class="copy" data-w="2" title="wie Segment 1">/)
  assert.equal((page.match(/class="var" data-group="2-2"/g) ?? []).length, 2) // the pair, one per column
  assert.match(page, /<th data-w="1"><a href="A_1648\.html#n69">A<\/a><\/th>/)
})

test('the overview lists what is aligned, and says so when nothing is', async () => {
  const synopses = await load()
  assert.match(synopsesPage(synopses), /synopse-n69\.html/)
  assert.match(synopsesPage([]), /Noch keine Ausrichtung/)
})

test("a place keeps the type the pipeline's rules gave it; one nobody typed is open", async () => {
  const [synopsis] = await load()
  const [, wording, spelling] = synopsis.segments

  // `auff`/`auf` is one word twice; `nimmermehr`/`glaube` is two words.
  assert.equal(spelling.apparatus[0].spelling, true)
  assert.deepEqual(spelling.apparatus[0].relation, { type: 'spelling', by: 'rule', rule: 'doubled letters' })
  assert.equal(spelling.apparatus[0].category, 'orthography')
  assert.equal(spelling.apparatus[0].state, 'proposed')
  assert.equal(wording.apparatus[0].spelling, false)
  assert.equal(wording.apparatus[0].relation, undefined)
  assert.equal(wording.apparatus[0].category, 'open')

  // The page carries the category, so the reader can switch it off and colour by it.
  const page = synopsisPage(synopsis)
  assert.match(page, /<span class="var" data-group="3-1" data-cat="orthography" data-step="doubled letters" data-state="proposed"/)
  assert.match(page, /<span class="var" data-group="2-2" data-cat="open"/)
  assert.match(page, /<span class="app-rel" data-by="rule" title="Regel, nicht bestätigt · doubled letters">Schreibung/)
})

test('a witness that reads nothing is a difference, and a row without one is quiet', async () => {
  const [synopsis] = await load()
  // The heading segment: F42A has no text there at all.
  assert.equal(synopsis.segments[0].differs, true)
  const quiet = synopsisPage(await loadBundle())
  assert.match(quiet, /<tr id="seg-2" class="quiet">/)
})

test('each place carries the step of the rule cascade that settled it, for the reader to leave out', async () => {
  const doc = alignment({ A: 'tei/A_1648.xml#n7', B: 'tei/B_1653.xml#n7', C: 'tei/C_1663_dok.xml#n7' }, [
    { cells: { A: ['Liebe', 'ſinnen/', 'figur', 'auff'], B: ['liebe', 'ſinnen', 'figur', 'auf'], C: ['liebe', 'ſinnen', 'geſtalt', 'auf'] },
      relations: { 0: rule('orthographic', 'case'), 1: rule('punctuation', 'punctuation'), 3: { type: 'spelling' } } },
  ])
  const dir = await mkdtemp(join(tmpdir(), 'filters-'))
  await writeFile(join(dir, 'n7.json'), JSON.stringify(doc), 'utf8')
  const [synopsis] = await loadSynopses(dir)
  const [capital, virgule, word, confirmed] = synopsis.segments[0].apparatus

  // The rule's own step; for a person's type, which has none, the last step of that type.
  assert.deepEqual([capital, virgule, word, confirmed].map((e) => e.step), ['case', 'punctuation', undefined, 'spelling variants'])
  assert.deepEqual([capital, virgule, word].map((e) => e.category), ['orthography', 'punctuation', 'open'])
  const page = synopsisPage(synopsis)
  assert.match(page, /<span class="var" data-group="1-1" data-cat="orthography" data-step="case" data-state="proposed"/)
  assert.match(page, /<span class="var" data-group="1-3" data-cat="open" data-state="open"/) // nothing to leave out

  // Which columns read alike, for colouring against one witness: A and B share `figur`.
  assert.deepEqual(word.alike, { A: ['A', 'B'], B: ['A', 'B'], C: ['C'] })
  assert.match(synopsisPage(synopsis), /data-group="1-3"[^>]* data-alike="1 2"><b>figur<\/b>/)
})

test("a person's classification stands, and says the place is settled", async () => {
  const doc = alignment({ A: 'tei/A_1648.xml#n7', B: 'tei/B_1653.xml#n7' }, [{ cells: { A: ['auff', 'figur'], B: ['auf', 'gestalt'] } }])
  ;(doc.segments[0].columns[0] as object as { relation: object }).relation = { type: 'lexical' }
  ;(doc.segments[0].columns[1] as object as { relation: object }).relation = { type: 'lexical', significant: true }
  const dir = await mkdtemp(join(tmpdir(), 'person-'))
  await writeFile(join(dir, 'n7.json'), JSON.stringify(doc), 'utf8')
  const [synopsis] = await loadSynopses(dir)
  // The rules would call `auff`/`auf` a spelling; a person said otherwise, and wins.
  assert.deepEqual(synopsis.segments[0].apparatus.map((e) => [e.category, e.state]),
    [['word', 'confirmed'], ['word', 'significant']])
})

test('how far the witnesses are apart is graded', async () => {
  const [synopsis] = await load()
  // Two readings between two witnesses is the lowest degree there is.
  assert.equal(synopsis.segments[1].apparatus[0].degree, 1)
  assert.match(synopsisPage(synopsis), /data-degree="1"/)
})

test('the page offers the reading options, and the script that drives them', async () => {
  const [synopsis] = await load()
  const page = synopsisPage(synopsis)

  for (const control of ['colour', 'varying', 'apparatus']) {
    assert.match(page, new RegExp(`data-syn="${control}"`))
  }
  // A chip per category, with its count; a box per filter and per witness.
  assert.equal((page.match(/data-syn-cat=/g) ?? []).length, CATEGORIES.length)
  assert.match(page, /<label class="syn-chip"[^>]* data-n="1"><input type="checkbox" data-syn-cat="orthography"> Orthographie <span class="n">1<\/span>/)
  // A box per step of the cascade, all on by default.
  assert.equal((page.match(/data-syn-ignore="[^"]+" checked>/g) ?? []).length, STEPS.length)
  assert.match(page, /title="ck\/k, th\/t[^"]*"><input type="checkbox" data-syn-ignore="spelling variants" checked> Schreibvarianten/)
  // The default is what the settings say.
  assert.match(page, /data-syn-preset="added deleted word grammar unclear open"\s+title="[^"]*">Voreinstellung/)
  assert.equal((page.match(/data-syn-witness=/g) ?? []).length, synopsis.witnesses.length)
  // The legend stands right under the options, not under the table.
  assert.ok(page.indexOf('class="syn-legend') < page.indexOf('<table class="synopsis">'))
  assert.match(page, /<td[^>]* data-w="1"/)
  // Only what a synopsis needs: the reading pages' script is not loaded here.
  assert.match(page, /<link rel="stylesheet" href="assets\/synopsis\.css">/)
  assert.match(page, /<script src="assets\/synopsis\.js">/)
  assert.doesNotMatch(page, /assets\/preview\.js/)
})

test('the apparatus of a segment lists its readings', async () => {
  const [synopsis] = await load()
  const page = synopsisPage(synopsis)

  // The heading only A has is a whole line more; the two others hold a place each.
  assert.equal((page.match(/<tr class="app">/g) ?? []).length, 3)
  // Each entry carries what the reader's choice is matched against.
  assert.match(page, /<li data-group="3-1" data-cat="orthography" data-step="doubled letters">/)
  // Lemma, bracket, the departing readings with their sigla.
  assert.match(page, /<li data-group="2-2"[^>]*>\s*<span class="rdg lem">nimmermehr <i>A<\/i><\/span> <span class="sep">]<\/span> <span class="rdg">glaube <i>F42A<\/i><\/span>/)
})

test('the apparatus groups witnesses that read alike, and says where one reads nothing', async () => {
  const doc = alignment({ A: 'tei/A_1648.xml#n7', B: 'tei/B_1653.xml#n7', C: 'tei/C_1663_dok.xml#n7', D: 'tei/D_1688.xml#n7' }, [
    { cells: { A: ['vertrawe', 'mir'], B: ['vertraue', 'mir'], C: ['vertraue', ''], D: ['glaube nicht', 'mir'] } },
  ])
  const dir = await mkdtemp(join(tmpdir(), 'lemma-'))
  await writeFile(join(dir, 'n7.json'), JSON.stringify(doc), 'utf8')
  const page = synopsisPage((await loadSynopses(dir))[0])
  assert.match(page, /<span class="rdg lem">vertrawe <i>A<\/i><\/span> <span class="sep">]<\/span> <span class="rdg">vertraue <i>B C<\/i><\/span><span class="sep">;<\/span> <span class="rdg">glaube nicht <i>D<\/i><\/span>/)
  assert.match(page, /<span class="rdg lem">mir <i>A B D<\/i><\/span> <span class="sep">]<\/span> <span class="rdg"><em>fehlt<\/em> <i>C<\/i><\/span>/)
})

test('each witness gets its distance from the others, segment by segment', async () => {
  const [synopsis] = await load()
  const [head, wording, spelling] = synopsis.segments

  assert.deepEqual(head.departures, { A: 0, F42A: -1 }) // F42A has no text there
  assert.deepEqual(wording.departures, { A: 2, F42A: 2 }) // two witnesses, one word apart
  assert.deepEqual(spelling.departures, { A: 1, F42A: 1 })
})

test('beside the bar, a sparkline: a bar per segment, as high as it disagrees, and a link to it', async () => {
  const page = synopsisPage((await load())[0])
  assert.match(page, /<div class="syn-glance"><span class="syn-mix">[\s\S]*?<\/span><svg class="syn-spark" viewBox="0 0 3 3"/)
  // The heading reads in one witness only; segment 2 is a word apart, segment 3 a spelling.
  assert.match(page, /<a href="#seg-1"><title>Segment 1<\/title><rect x="0" y="0" width="1" height="3" class="hit"\/><\/a>/)
  assert.match(page, /<a href="#seg-2"><title>Segment 2<\/title><rect[^>]*class="hit"\/><rect x="1" y="1" width="0.8" height="2"\/><\/a>/)
  assert.doesNotMatch(page, /syn-strip|data-row=/) // the strip it replaces
})

test('inside a variant, only the characters that differ are marked', async () => {
  const [synopsis] = await load()
  const page = synopsisPage(synopsis)

  // `auff` against `auf` is one letter, not a whole word.
  assert.match(page, /data-cat="orthography"[^>]*>auf<b>f<\/b><\/span>/)
  // Another word is marked whole.
  assert.match(page, /data-cat="open"[^>]*><b>glaube<\/b><\/span>/)
})

test('a bundle is divided into the poems its headings mark', async () => {
  const bundle = await loadBundle()
  assert.deepEqual(bundle.units.map((u) => [u.n, u.title, u.start]), [[1, 'Psalm 1', 1], [2, 'Psalm 3', 3]])
  assert.deepEqual(bundle.segments.map((s) => s.unit), [0, 0, 1, 1])

  // A run of heading segments is one heading told by several witnesses, not
  // several poems: `n69` opens with three of them and is one poem.
  const [single] = await load()
  assert.equal(single.units.length, 1)
  assert.equal(single.units[0].title, 'Liebgedicht')
})

test('a bundle is read poem by poem, a single poem without the apparatus of it', async () => {
  const bundle = synopsisPage(await loadBundle())
  assert.equal((bundle.match(/<tbody>/g) ?? []).length, 2)
  assert.match(bundle, /<span class="unit-n">2\/2<\/span> <b>Psalm 3<\/b>[\s\S]*?2 Segmente · 0 Varianten/)
  // The bands are a bundle's business, and are off until the reader asks.
  assert.match(bundle, /data-syn="units"/)
  assert.match(bundle, /<nav class="syn-units[^>]*>[\s\S]*?href="#seg-3"/)

  const [single] = await load()
  const page = synopsisPage(single)
  assert.equal((page.match(/<tbody>/g) ?? []).length, 1)
  assert.doesNotMatch(page, /syn-units|tr class="unit"|data-syn="units"/)
})

test('a segment can be linked to and counted', async () => {
  const [synopsis] = await load()
  const page = synopsisPage(synopsis)

  assert.match(page, /<td class="num"[^>]*><a\s+href="#seg-2" data-syn-link>2<\/a><\/td>/)
  assert.match(page, /<output class="ctrl syn-count" data-syn-count/)
})

test('a reading links back to the line it was taken from', async () => {
  const [synopsis] = await load()
  // `A-l0002` stands third in the print: two lines the print sets apart are one
  // imported line, which is why the map is written and not counted here.
  assert.deepEqual(synopsis.lines, { 'A-l0001': 1, 'A-l0002': 3 })

  const page = synopsisPage(synopsis)
  assert.match(page, /<a class="line-link no-print"[^>]*href="A_1648\.html#n69-l3">/)
  // F42A has no line map, and a heading has no line at all.
  assert.doesNotMatch(page, /href="[^"]*F42A[^"]*#n69-l/)
  assert.equal((page.match(/class="line-link no-print"/g) ?? []).length, 2)
})

test('a file of another format is refused, with what to do', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stale-'))
  await writeFile(join(dir, 'n7.json'), JSON.stringify({ ...BUNDLE, format: 'textalign-alignment' }), 'utf8')
  await assert.rejects(loadSynopses(dir), /n7\.json is not Alignment JSON; regenerate it/)
})

test('a document aligned by TextAlign says so, and a witness without a source is not linked', async () => {
  const doc = alignment({ A: 'tei/A_1648.xml#n7', B: '' }, [{ cells: { A: ['ein'], B: ['eyn'] } }],
    { align_algorithm: 'dekker', aligned_by: { tool: 'textalign', version: '0.1.0', algorithm: 'dekker', normalizer: 'RuleNormalizer' } })
  delete (doc.witnesses[1] as { source?: string }).source
  const dir = await mkdtemp(join(tmpdir(), 'by-'))
  await writeFile(join(dir, 'n7.json'), JSON.stringify(doc), 'utf8')
  const page = synopsisPage((await loadSynopses(dir))[0])
  assert.match(page, /Ausgerichtet mit TextAlign 0\.1\.0, Verfahren\s+<code>dekker, RuleNormalizer<\/code>;/)
  assert.match(page, /<th data-w="1"><a href="A_1648\.html#n7">A<\/a><\/th>\s*<th data-w="2">B<\/th>/)
})

test("a model's other pairing of the lines is marked on its rows, not shown in their place", async () => {
  const doc = alignment({ A: 'tei/A_1648.xml#n7', B: 'tei/B_1653.xml#n7' },
    [{ cells: { A: ['ein'], B: ['eyn'] } }, { cells: { A: ['vers'], B: ['vers'] } }])
  const proposals = [{ rows: ['s1', 's2'], segments: [{ ...doc.segments[0], id: 's1-1', columns: [] }],
    by: 'model', model: 'm', rationale: 'one verse' }]
  const dir = await mkdtemp(join(tmpdir(), 'proposed-'))
  await writeFile(join(dir, 'n7.json'), JSON.stringify({ ...doc, proposals }), 'utf8')
  const [synopsis] = await loadSynopses(dir)
  assert.deepEqual(synopsis.segments.map((s) => s.proposal?.rows), [[1, 2], [1, 2]])
  const page = synopsisPage(synopsis)
  assert.equal((page.match(/<tr id="seg-/g) ?? []).length, 2) // the rows as they are
  assert.match(page, /data-syn-link>1<\/a><span class="pairing" title="Das Modell m schlägt vor, die Zeilen der Segmente 1–2 anders zu paaren: one verse\./)
  assert.match(page, /Für 2 schlägt ein Modell eine andere Zeilenpaarung vor\./)
})

test('the rows the alignment editor doubts are marked, with its reasons', async () => {
  const doc = alignment({ A: 'tei/A_1648.xml#n7', B: 'tei/B_1653.xml#n7' },
    [{ cells: { A: ['ein'], B: ['eyn'] } }, { cells: { A: ['vers'], B: ['vers'] } }])
  const dir = await mkdtemp(join(tmpdir(), 'doubts-'))
  await writeFile(join(dir, 'n7.json'), JSON.stringify(doc), 'utf8')
  const estimate = join(await mkdtemp(join(tmpdir(), 'estimate-')), 'estimate.json') // beside documents/, not in it
  await writeFile(estimate, JSON.stringify({ poems: { n7: { doubts: { s2: ['B is missing'] },
    typos: [{ segment: 's1', readings: { A: 'ein', B: 'eyn' }, letters: 'i/y' }] } } }), 'utf8')
  const [synopsis] = await loadSynopses(dir, '', estimate)
  assert.deepEqual(synopsis.segments.map((s) => s.doubts), [[], ['B is missing']])
  const page = synopsisPage(synopsis)
  assert.match(page, /data-syn-link>2<\/a><span class="doubt" title="Ausrichtung zweifelhaft: B is missing">\?<\/span>/)
  assert.match(page, /1 Segment ist zweifelhaft ausgerichtet\./)
  assert.match(synopsesPage([synopsis]), /<td class="num">1<\/td>\s*<\/tr>/) // the overview's column
  // The probable typos, by row number, as the Hinweise page lists them.
  assert.deepEqual(synopsis.typos, [{ n: 1, readings: { A: 'ein', B: 'eyn' }, letters: 'i/y' }])
  const typo = { href: `${synopsisHref('n7')}#seg-1`, title: 'n7 · Segment 1', file: 'n7', detail: 'i/y: A ein · B eyn' }
  assert.match(findingsPage([], [], [], [typo]),
    /Mögliche Transkriptionsfehler \(aus den Synopsen\) <span class="flag">1<\/span>[\s\S]*?<a href="synopse-n7\.html#seg-1">n7 · Segment 1<\/a>/)
  // Without a measurement nothing is marked, and nothing fails.
  assert.equal((await loadSynopses(dir, '', join(dir, 'none.json')))[0].doubtful, 0)
})

test('the page says first what it rests on: who aligned it, who checked it, who typed it', async () => {
  const [synopsis] = await load()
  assert.match(synopsisPage(synopsis), /<p class="syn-basis"><b class="basis" data-basis="lera">LERA<\/b> automatisch ausgerichtet \(<code>cgsa<\/code>\) · noch von niemandem geprüft · Typen: 1 von Regeln<\/p>/)
  assert.match(synopsesPage([synopsis]), /<td><b class="basis" data-basis="lera">LERA<\/b><\/td>/)
  // A place a person typed is a row a person worked on.
  const doc = alignment({ A: 'tei/A_1648.xml#n7', B: 'tei/B_1653.xml#n7' },
    [{ cells: { A: ['ein'], B: ['eyn'] }, relations: { 0: { type: 'spelling' } } }, { cells: { A: ['vers'], B: ['vers'] } }],
    { aligned_by: { tool: 'textalign', algorithm: 'dekker' } })
  const dir = await mkdtemp(join(tmpdir(), 'basis-'))
  await writeFile(join(dir, 'n7.json'), JSON.stringify(doc), 'utf8')
  const [checked] = await loadSynopses(dir)
  assert.match(synopsisPage(checked), /data-basis="textalign">TextAlign<\/b> automatisch ausgerichtet \(<code>dekker<\/code>\) · <b class="basis" data-basis="person">von Hand geprüft<\/b> 1 von 2 Segmenten · Typen: 1 bestätigt/)
  assert.match(synopsesPage([checked]), /TextAlign<\/b> <b class="basis" data-basis="person">geprüft<\/b><\/td>/)
})

test("a poem's variants are summed up by category, and by pair of witnesses", async () => {
  const doc = alignment({ A: 'tei/A_1648.xml#n7', B: 'tei/B_1653.xml#n7', C: 'tei/C_1663_dok.xml#n7' }, [
    { cells: { A: ['vnd', 'figur'], B: ['und', 'figur'], C: ['und', 'geſtalt'] }, relations: { 0: rule('orthographic', 'u/v, i/j') } },
    { cells: { A: ['vnd'], B: ['und'], C: ['und'] }, relations: { 0: rule('orthographic', 'u/v, i/j') } },
  ])
  const dir = await mkdtemp(join(tmpdir(), 'mix-'))
  await writeFile(join(dir, 'n7.json'), JSON.stringify(doc), 'utf8')
  const [synopsis] = await loadSynopses(dir)
  const page = synopsisPage(synopsis)
  // One bar, a part per category, each a preset for that category alone.
  assert.match(page, /<span class="syn-mix"><button type="button" data-cat="orthography" data-syn-preset="orthography" style="flex-grow:2" title="Orthographie 2 — nur diese zeigen"><\/button><button type="button" data-cat="open"[^>]*flex-grow:1/)
  // The register under the categories' names.
  assert.match(page, /<h4>Orthographie <span class="count">1<\/span><\/h4>\s*<ol><li data-cat="orthography"[^>]*><b>vnd<\/b>/)
  // `vnd`/`und` is spelling, so A and B are 0 apart in substance; `figur`/`geſtalt` puts C 1 from both.
  assert.match(page, /<tr><th>A<\/th><td><\/td><td style="--k:0\.00" title="A gegen B: 0 sachliche von 2 Stellen">0<\/td><td style="--k:1\.00" title="A gegen C: 1 sachliche von 3 Stellen">1<\/td><\/tr>/)
  assert.doesNotMatch(synopsisPage((await load())[0]), /syn-pairs/) // two witnesses: the poem's own count

  // The overview: a bar and a sparkline per poem, every count to sort by, and the sets that recur.
  const overview = synopsesPage([synopsis, { ...synopsis, id: 'n8' }])
  assert.match(overview, /<tr data-variants="3" data-doubtful="0" data-segments="2" data-added="0" data-deleted="0" data-word="0" data-grammar="0" data-punctuation="0" data-orthography="2"[^>]*>/)
  assert.match(overview, /<option value="data-word">Wortvariante<\/option>/)
  assert.match(overview, /<svg class="syn-spark" viewBox="0 0 2 3"[^>]*><rect x="0" y="1" width="0.8" height="2"\/><rect x="1" y="2"/)
  assert.match(overview, /<summary>Wiederkehrende Lesarten: 2 Sätze[\s\S]*?<b>vnd<\/b> <span class="sep">\|<\/span> <b>und<\/b>\s*<span class="count">×4 in 2 Gedichten<\/span>/)
  assert.doesNotMatch(synopsesPage([synopsis]), /Wiederkehrende/) // one poem recurs in nothing
})

test('the page says which export it was built from', async () => {
  const page = synopsisPage((await load())[0])
  assert.match(page, /Ausgerichtet in LERA, Verfahren\s+<code>cgsa<\/code>, zuletzt geändert am 29\.09\.2026;/)
  assert.match(page, /<span class="syn-swatch"><b>—<\/b> kein Text<\/span>/) // the legend
})

test('the lines of an aligned poem are numbered where the reader can reach them', () => {
  const html = '<section id="n69"><div class="tei-lg"><div class="tei-l">a</div>' +
    '<div class="tei-l r-c">b</div></div></section>' +
    '<section id="n70"><div class="tei-l">c</div></section>'
  const out = numberLines(html, new Set(['n69']))

  assert.match(out, /<div id="n69-l1" class="tei-l">a/)
  assert.match(out, /<div id="n69-l2" class="tei-l r-c">b/)
  assert.doesNotMatch(out, /id="n69-lg/) // `tei-lg` is not a line
  assert.doesNotMatch(out, /id="n70-l1"/) // that poem has no alignment
})

test('a witness absent from the row is not an omission at every place in it', async () => {
  const [synopsis] = await load()
  const [head, wording] = synopsis.segments

  // F42A has no text in the heading at all, so it weighs on nothing there.
  assert.equal(head.apparatus.length, 0)
  // Two witnesses both reading something: a substitution, not an omission.
  assert.equal(wording.apparatus[0].omission, false)
})

test('the colouring modes and their legend come from one table', async () => {
  const page = synopsisPage((await load())[0])

  assert.match(page, /data-syn="colour"[\s\S]*?value="variance"[\s\S]*?value="type"[\s\S]*?value="state"[\s\S]*?value="change"/)
  // Against each witness, by its column.
  assert.match(page, /<option value="w2">gegen F42A<\/option>/)
  // The swatch is a mark like any other, so the stylesheet colours both at once.
  assert.match(page, /<span class="syn-keys" data-for="variance">[\s\S]*?<span class="var" data-degree="1">/)
  assert.match(page, /<span class="syn-keys" data-for="type">[\s\S]*?<span class="var" data-cat="word"><b>Aa<\/b><\/span> Wortvariante/)
  assert.match(page, /<span class="syn-keys" data-for="state">[\s\S]*?<span class="var" data-state="proposed">/)
  assert.match(page, /<span class="syn-keys" data-for="change">[\s\S]*?<span class="var" data-change="om">/)
  assert.match(page, /<span class="syn-keys" data-for="w1">[\s\S]*?weicht von A ab/)
  assert.match(page, /<span class="var"[^>]* data-change="sub"/)
})

test('the register lists each set of readings once, the most frequent first', async () => {
  const [synopsis] = await load()
  assert.deepEqual(synopsis.groups.map((g) => [g.forms.join('|'), g.places.length]),
    // Equally frequent, so by their first reading: `auff` before `nimmermehr`.
    [['auff|auf', 1], ['nimmermehr|glaube', 1]])

  const page = synopsisPage(synopsis)
  assert.match(page, /<summary>Lesarten: 2 verschiedene an 2 Stellen<\/summary>/)
  assert.match(page, /<li data-cat="orthography" data-step="doubled letters"><b>auff<\/b>[\s\S]*?<b>auf<\/b>[\s\S]*?×1[\s\S]*?href="#seg-3"/)
})

test("a document's classifications reach the apparatus, a model's as provisional", async () => {
  const tokens = (...words: string[]) => words.flatMap((t, i) => (i ? [{ t: ' ' }, { t }] : [{ t }]))
  const doc = {
    format: 'alignment-json', format_version: '1.0', meta: {}, settings: { filters: [] },
    witnesses: [{ siglum: 'A', name: 'n7-A_1648', tokens: tokens('ein', 'figur', 'auff') },
      { siglum: 'B', name: 'n7-B_1653', tokens: tokens('ein', 'gestalt', 'auf') }],
    segments: [{
      id: 's1', number: 1, roles: {},
      cells: { A: { span: [0, 5] }, B: { span: [0, 5] } },
      columns: [
        { spans: { A: [0, 1], B: [0, 1] } },
        { spans: { A: [2, 3], B: [2, 3] }, relation: { type: 'lexical' } },
        { spans: { A: [4, 5], B: [4, 5] },
          relation: { type: 'spelling', by: 'model', model: 'm', confidence: 0.82, rationale: 'doubled f' } },
      ],
    }],
  }
  const dir = await mkdtemp(join(tmpdir(), 'doc-'))
  await writeFile(join(dir, 'n7.json'), JSON.stringify(doc), 'utf8')
  const [synopsis] = await loadSynopses(dir)

  assert.deepEqual(synopsis.segments[0].apparatus.map((e) => e.relation?.type), ['lexical', 'spelling'])
  const page = synopsisPage(synopsis)
  assert.match(page, /<span class="app-rel">Wortlaut<\/span>/) // a person's: the edition's judgement
  assert.match(page, /<span class="app-rel" data-by="model" title="Modell 82 %, nicht bestätigt · m · doubled f">Schreibung <small>Modell 82 %<\/small><\/span>/)
  // The reader can take the model's types back; the place says it is the model's.
  assert.match(page, /<input type="checkbox" data-syn-model checked> Modellvorschläge/)
  assert.match(page, /<span class="var" data-group="1-3" data-cat="orthography" data-by="model" data-state="proposed"/)
  assert.doesNotMatch(synopsisPage((await load())[0]), /data-syn-model/) // no model, no switch
})

const SOURCES = (...sigla: string[]) => Object.fromEntries(sigla.map((s) => [s, `tei/${s}.xml#n1`]))

async function synopsisOf(sources: Record<string, string>, rows: Row[]) {
  const dir = await mkdtemp(join(tmpdir(), 'categories-'))
  await writeFile(join(dir, 'n1.json'), JSON.stringify(alignment(sources, rows)), 'utf8')
  return (await loadSynopses(dir))[0]
}

test('additions and deletions follow the prints, by the default ones where they part', async () => {
  const synopsis = await synopsisOf(SOURCES('A', 'B', 'C', 'F42A'), [
    { cells: { A: ['eins', 'mehr'], B: ['eins', ''], C: ['eins', ''], F42A: ['eins', 'mehr'] } },
    { cells: { A: ['', 'zwei'], B: ['neu', 'zwei'], C: ['neu', 'zwei'], F42A: ['neu', 'zwei'] } },
    { cells: { A: ['drei', ''], B: ['drei', ''], C: ['drei', ''], F42A: ['drei', 'alt'] } },
  ])
  assert.deepEqual(synopsis.segments.map((s) => s.apparatus[0].category), ['deleted', 'added', 'deleted'])
})

test('a witness without text in a row makes it a whole line more or less, and only the default prints start shown', async () => {
  const synopsis = await synopsisOf(SOURCES('A', 'B', 'D'), [
    { cells: { A: ['alt'], B: ['alt'], D: ['alt'] } },
    { cells: { A: ['nur'], B: null, D: null } },
    { cells: { A: null, B: ['neu'], D: ['neu'] } },
  ])
  assert.deepEqual(synopsis.segments.map((s) => s.line), [undefined, 'deleted', 'added'])
  const page = synopsisPage(synopsis)
  assert.match(page, /<li data-cat="deleted" data-missing="2 3" data-present="1">\s*Ganze Zeile: fehlt in B D/)
  assert.match(page, /data-syn-witness="1" checked> A/)
  assert.match(page, /data-syn-witness="3"> D/)
  assert.match(page, /data-syn-cat="word" checked>/)
  assert.doesNotMatch(page, /data-syn-cat="punctuation" checked>/)
})

test('where the default prints leave nothing to compare, every witness starts shown', async () => {
  const page = synopsisPage(await synopsisOf(SOURCES('C', 'D'), [{ cells: { C: ['a'], D: ['b'] } }]))
  assert.match(page, /data-syn-witness="2" checked> D/)
})

test('every relation type of the format has a category, and every setting names one', () => {
  for (const type of ['spelling', 'orthographic', 'punctuation', 'grammatical', 'lexical', 'transposition', 'repetition', 'uncertain', 'other']) {
    assert.ok(type in SETTINGS.types, type)
  }
  for (const c of [...Object.values(SETTINGS.types), ...SETTINGS.shown, ...SETTINGS.checkFirst]) assert.ok(c in SETTINGS.categories, c)
})
