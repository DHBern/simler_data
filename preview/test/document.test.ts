/**
 * What a document costs the reader when its own markup is wrong: an id the rest of
 * the toolchain will not take, a note the page has nowhere to put, and a file that
 * will not parse at all.
 *
 *     node --import tsx --test test/document.test.ts
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { idFindings, parse } from '../lib'
import { documentPage, findingsPage, indexPage, type PreviewDoc } from '../page'

test('an id used twice, or one no XML tool takes, is a finding', () => {
  const findings = idFindings(
    parse(`<TEI xml:id="Aa,_Bb">
      <teiHeader><msDesc xml:id="src"/></teiHeader>
      <text><body><note xml:id="n1"/><note xml:id="n1"/><note xml:id="Töchterlein"/></body></text>
    </TEI>`),
  ).join('\n')
  assert.match(findings, /zweimal vergeben.*: n1$/m)
  assert.match(findings, /kein NCName.*: Aa,_Bb$/m)
  assert.doesNotMatch(findings, /Töchterlein|src/) // letters beyond ASCII are names too
})

test('a note goes to the apparatus whatever its place', () => {
  const doc: PreviewDoc = {
    file: 'x.xml', out: 'x.html', title: 'X', html: '<p>Text</p>', text: 'Text',
    notes: [
      { place: 'end', id: 'note-1', number: 1, html: '<p>Am Ende</p>' },
      { place: 'margin', html: '<p>Am Rand</p>' },
    ],
    pages: [], facsRoot: null, entities: {}, warnings: [],
  }
  const page = documentPage(doc, [])
  assert.match(page, /data-place="margin"[\s\S]*<p>Am Rand<\/p>/)
  assert.match(page, /class="endnote" id="note-1"[\s\S]*<p>Am Ende<\/p>/)
})

test('a document that will not parse says so on its page, the index and the findings', () => {
  const doc: PreviewDoc = {
    file: 'x.xml', out: 'x.html', title: 'x.xml', html: '', text: '', notes: [],
    pages: [], facsRoot: null, entities: {}, warnings: [], malformed: 'Missing end tag (line 3)',
  }
  assert.match(documentPage(doc, []), /nicht wohlgeformt[\s\S]*Missing end tag \(line 3\)/)
  assert.match(indexPage([doc], 'tei', null), /flag-error/)
  const findings = findingsPage([doc], ['Modell p-1: Prädikat nicht auswertbar'], [])
  assert.ok(findings.indexOf('XML nicht wohlgeformt') < findings.indexOf('ODD')) // first, above the ODD
})
