/**
 * What the synopsis must not lose: which words vary, which reading answers
 * which across the witnesses, and the difference between a witness that has
 * nothing here and one whose cell repeats an earlier segment.
 *
 *     node --import tsx --test test/synopsis.test.ts
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { loadSynopses, numberLines, wordForm } from '../alignments'
import { synopsesPage, synopsisPage } from '../synopsis'

/**
 * An Alignment JSON document, as `alignment/documents.py` writes them. A row
 * gives each witness its readings column by column (`''`: a gap there), or
 * null where the witness has no text.
 */
interface Row {
  cells: Record<string, string[] | null>
  head?: boolean
  copy?: Record<string, string>
  refs?: Record<string, string[]>
}

function alignment(sources: Record<string, string>, rows: Row[], meta: object = {}) {
  const witnesses = Object.entries(sources).map(([siglum, source]) => ({ siglum, name: siglum, source, tokens: [] as { t: string }[] }))
  const segments = rows.map((row, i) => {
    const cells: Record<string, object> = {}
    const columns: { spans: Record<string, [number, number]> }[] = []
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
    const roles = row.head ? Object.fromEntries(Object.keys(sources).filter((s) => row.cells[s]).map((s) => [s, 'head'])) : {}
    return { id: `s${i + 1}`, number: i + 1, roles, cells, columns, ...(row.refs ? { refs: row.refs } : {}) }
  })
  return { format: 'alignment-json', format_version: '1.0', meta, settings: { filters: [] }, witnesses, segments }
}

const EXPORT = alignment({ A: 'tei/A_1648.xml#n69', F42A: 'tei/F42A.xml#n69' }, [
  { cells: { A: ['Liebgedicht'], F42A: null }, head: true },
  { cells: { A: ['ich', 'nimmermehr'], F42A: ['ich', 'glaube'] }, copy: { F42A: 's1' },
    refs: { A: ['A-l0001'], F42A: ['F42A-l0001'] } },
  { cells: { A: ['auff', 'Gott'], F42A: ['auf', 'Gott'] }, refs: { A: ['A-l0002'], F42A: ['F42A-l0002'] } },
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

test('a difference in spelling is told from a difference in wording', async () => {
  const [synopsis] = await load()
  const [, wording, spelling] = synopsis.segments

  // `auff`/`auf` is one word twice; `nimmermehr`/`glaube` is two words.
  assert.equal(spelling.apparatus[0].spelling, true)
  assert.equal(spelling.varies, 'spelling')
  assert.equal(wording.apparatus[0].spelling, false)
  assert.equal(wording.varies, 'word')

  // The page carries the distinction, so the reader can switch it off.
  const page = synopsisPage(synopsis)
  assert.match(page, /<span class="var" data-group="3-1" data-kind="spelling"/)
  assert.match(page, /<span class="var" data-group="2-2" data-kind="word"/)
})

test('a witness that reads nothing counts as the strongest difference', async () => {
  const [synopsis] = await load()
  // The heading segment: F42A has no text there at all.
  assert.equal(synopsis.segments[0].varies, 'word')
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

  for (const control of ['variants', 'varying', 'apparatus', 'base']) {
    assert.match(page, new RegExp(`data-syn="${control}"`))
  }
  // One box per witness, and one base to choose among them.
  assert.equal((page.match(/data-syn-witness=/g) ?? []).length, synopsis.witnesses.length)
  assert.match(page, /<td[^>]* data-w="1"/)
  // Only what a synopsis needs: the reading pages' script is not loaded here.
  assert.match(page, /<link rel="stylesheet" href="assets\/synopsis\.css">/)
  assert.match(page, /<script src="assets\/synopsis\.js">/)
  assert.doesNotMatch(page, /assets\/preview\.js/)
})

test('the apparatus of a segment lists its readings', async () => {
  const [synopsis] = await load()
  const page = synopsisPage(synopsis)

  assert.match(page, /<tr class="app" data-varies="word"\s+data-kind="word">/)
  // A row of nothing but spellings says so, so it can go when they are switched off.
  assert.match(page, /<tr class="app" data-varies="spelling"\s+data-kind="spelling">/)
  assert.match(page, /<li data-group="2-2"[\s\S]*?<i>A<\/i> nimmermehr[\s\S]*?<i>F42A<\/i> glaube/)
})

test('each witness gets its distance from the others, segment by segment', async () => {
  const [synopsis] = await load()
  const [head, wording, spelling] = synopsis.segments

  assert.deepEqual(head.departures, { A: 0, F42A: -1 }) // F42A has no text there
  assert.deepEqual(wording.departures, { A: 2, F42A: 2 }) // two witnesses, one word apart
  assert.deepEqual(spelling.departures, { A: 1, F42A: 1 })
})

test('the strip holds a line per segment, as long as that segment disagrees', async () => {
  const [synopsis] = await load()
  const page = synopsisPage(synopsis)

  assert.equal((page.match(/<i data-row=/g) ?? []).length, 3)
  assert.match(page, /<i data-row="2" data-varies="word" data-level="2"/)
  assert.match(page, /<u class="syn-here">/)
  // Ticks say where the next poem of a bundle starts; a single poem has none.
  assert.doesNotMatch(page, /class="tick"/)
  assert.match(synopsisPage(await loadBundle()), /<i data-row="3"[^>]* class="tick"/)
})

test('inside a variant, only the characters that differ are marked', async () => {
  const [synopsis] = await load()
  const page = synopsisPage(synopsis)

  // `auff` against `auf` is one letter, not a whole word.
  assert.match(page, /data-kind="spelling"[^>]*>auf<b>f<\/b><\/span>/)
  // Another word is marked whole.
  assert.match(page, /data-kind="word"[^>]*><b>glaube<\/b><\/span>/)
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

test('rows a model proposes are not shown until a person accepts them', async () => {
  const doc = alignment({ A: 'tei/A_1648.xml#n7', B: 'tei/B_1653.xml#n7' }, [{ cells: { A: ['ein'], B: ['eyn'] } }])
  const dir = await mkdtemp(join(tmpdir(), 'proposed-'))
  await writeFile(join(dir, 'n7.json'), JSON.stringify(doc), 'utf8')
  const plain = synopsisPage((await loadSynopses(dir))[0])
  const proposals = [{ rows: ['s1'], segments: [{ ...doc.segments[0], id: 's1-1', columns: [] }], by: 'model', model: 'm' }]
  await writeFile(join(dir, 'n7.json'), JSON.stringify({ ...doc, proposals }), 'utf8')
  assert.equal(synopsisPage((await loadSynopses(dir))[0]), plain)
})

test('the page says which export it was built from', async () => {
  const page = synopsisPage((await load())[0])
  assert.match(page, /Ausgerichtet in LERA, Verfahren\s+<code>cgsa<\/code>, zuletzt geändert am 29\.09\.2026;/)
  assert.match(page, /kein Text in diesem Textzeugen/) // the legend
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

  assert.match(page, /data-syn="colour"[\s\S]*?value="variance"[\s\S]*?value="change"/)
  // The swatch is a mark like any other, so the stylesheet colours both at once.
  assert.match(page, /<span class="syn-keys" data-for="variance">[\s\S]*?<span class="var" data-degree="1">/)
  assert.match(page, /<span class="syn-keys" data-for="change">[\s\S]*?<span class="var" data-change="om">/)
  assert.match(page, /<span class="var"[^>]* data-change="sub">/)
})

test('the register lists each set of readings once, the most frequent first', async () => {
  const [synopsis] = await load()
  assert.deepEqual(synopsis.groups.map((g) => [g.forms.join('|'), g.places.length]),
    // Equally frequent, so by their first reading: `auff` before `nimmermehr`.
    [['auff|auf', 1], ['nimmermehr|glaube', 1]])

  const page = synopsisPage(synopsis)
  assert.match(page, /<summary>Lesarten: 2 verschiedene an 2 Stellen<\/summary>/)
  assert.match(page, /<li data-kind="spelling"><b>auff<\/b>[\s\S]*?<b>auf<\/b>[\s\S]*?×1[\s\S]*?href="#seg-3"/)
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
  assert.match(page, /<span class="app-rel">lexical<\/span>/) // a person's: the edition's judgement
  assert.match(page, /<span class="app-rel" data-by="model" title="Modell 82 %, nicht bestätigt · m · doubled f">spelling <small>Modell 82 %<\/small><\/span>/)
})

// TextAlign's own cases for its rule cascade, when a checkout is beside this one
// (or at $TEXTALIGN): the preview's copy of `word_form` must agree with them.
const cases = join(process.env.TEXTALIGN ?? join(import.meta.dirname, '..', '..', '..', 'text-alignment'),
  'editor', 'test', 'fixtures', 'rule-cases.json')

test("a spelling is what TextAlign's rule cascade calls one", { skip: !existsSync(cases) && 'no TextAlign checkout' }, () => {
  const fixture = JSON.parse(readFileSync(cases, 'utf8'))
  for (const [text, form] of Object.entries(fixture.word_forms)) assert.equal(wordForm(text), form, text)
  // Readings share a word form exactly where a step of the cascade settles them.
  for (const { readings, expected } of fixture.cases) {
    if (new Set(readings).size < 2 || readings.some((r: string) => !r.trim())) continue // no variant, or an omission
    const cascade = expected && !['word order', 'repeated word'].includes(expected.rule)
    assert.equal(new Set(readings.map(wordForm)).size === 1, Boolean(cascade), readings.join(' | '))
  }
})
