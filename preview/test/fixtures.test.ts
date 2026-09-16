/**
 * Conformance fixtures: each `fixtures/tei/<case>.xml`, rendered with
 * `fixtures/pm.odd`, must give `fixtures/<case>.html` — the page and the notes it
 * collects for the apparatus — and `fixtures/<case>.txt`, the ODD's `plain`
 * output, which is what the search indexes.
 *
 *     node --import tsx --test test/fixtures.test.ts
 *     UPDATE_FIXTURES=1 node --import tsx --test test/fixtures.test.ts
 *
 * The second form rewrites the expected files: run it after an intended change
 * and read the diff. The ODD and the TEI cases come from the compiler's own
 * suite; see `fixtures/README.md` for what they cover and where the two
 * renderings differ.
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { readOdd } from '../lib/odd/odd'
import { createProcessor, renderTei, type RenderResult } from '../lib/tei/render'
import { parse } from '../lib/tei/xast'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const processor = createProcessor(readOdd(readFileSync(join(dir, 'pm.odd'), 'utf8')))

/** The page, and below it every note body, as the apparatus would hold it. */
const page = (r: RenderResult) =>
  [r.html, ...r.notes.map((n) => `<!-- note ${n.number ?? '–'}, place ${n.place} -->\n${n.html}`)].join('\n')

/** The expected file, written first where the run is an update. */
function expected(name: string, actual: string): string {
  const file = join(dir, name)
  if (process.env.UPDATE_FIXTURES) writeFileSync(file, actual, 'utf8')
  return readFileSync(file, 'utf8')
}

for (const file of readdirSync(join(dir, 'tei'))) {
  const name = basename(file, '.xml')
  test(name, () => {
    const result = renderTei(parse(readFileSync(join(dir, 'tei', file), 'utf8')), processor)
    assert.deepEqual(result.warnings, [])
    assert.deepEqual(result.unmapped, [])
    assert.equal(page(result) + '\n', expected(`${name}.html`, page(result) + '\n'))
    assert.equal(result.text + '\n', expected(`${name}.txt`, result.text + '\n'))
  })
}
