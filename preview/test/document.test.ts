/**
 * What a document costs the reader when its own markup is wrong: an id the rest of
 * the toolchain will not take, a note the page has nowhere to put, and a file that
 * will not parse at all.
 *
 *     node --import tsx --test test/document.test.ts
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { finding, idFindings, parse } from 'tei-odd-interpreter'
import { inGerman } from '../messages'
import { documentPage, findingsPage, indexPage, sourcePage, type PreviewDoc } from '../page'

test('an id used twice, or one no XML tool takes, is a finding', () => {
  const findings = idFindings(
    parse(`<TEI xml:id="Aa,_Bb">
      <teiHeader><msDesc xml:id="src"/></teiHeader>
      <text><body><note xml:id="n1"/><note xml:id="n1"/><note xml:id="Töchterlein"/></body></text>
    </TEI>`),
  ).map((f) => f.message).join('\n')
  assert.match(findings, /used twice.*: n1$/m)
  assert.match(findings, /no NCName.*: Aa,_Bb$/m)
  assert.doesNotMatch(findings, /Töchterlein|src/) // letters beyond ASCII are names too
})

test('the pages say the findings in German', () => {
  assert.equal(inGerman(finding('model-unused', { model: 'p-1' })), 'Modell p-1: greift nie')
  assert.equal(inGerman(finding('id-twice', { id: 'n1' })), 'xml:id zweimal vergeben, Verweise landen an der falschen Stelle: n1')
})

test('a note goes to the apparatus whatever its place', () => {
  const doc: PreviewDoc = {
    file: 'x.xml', out: 'x.html', title: 'X', lang: 'de', html: '<p>Text</p>', text: 'Text',
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

test('the page takes its language and credit from the page model', () => {
  const doc: PreviewDoc = {
    file: 'x.xml', out: 'x.html', title: 'X', lang: 'la', credit: 'Facsimiles: e-rara.ch.', html: '', text: '',
    notes: [], pages: [], facsRoot: null, entities: {}, warnings: [],
  }
  const page = documentPage(doc, [], { text: 'The ODD’s terms.' } as Parameters<typeof documentPage>[2])
  assert.match(page, /<html lang="la"/)
  assert.match(page, /<footer class="terms">Facsimiles: e-rara\.ch\.<\/footer>/)
  assert.doesNotMatch(page, /The ODD’s terms/) // the credit takes their place
})

test('a document that will not parse says so on its page, the index and the findings', () => {
  const doc: PreviewDoc = {
    file: 'x.xml', out: 'x.html', title: 'x.xml', lang: 'de', html: '', text: '', notes: [],
    pages: [], facsRoot: null, entities: {}, warnings: [], malformed: 'Missing end tag (line 3)',
  }
  assert.match(documentPage(doc, []), /nicht wohlgeformt[\s\S]*Missing end tag \(line 3\)/)
  assert.match(indexPage([doc], 'tei', null), /flag-error/)
  const findings = findingsPage([doc], ['Modell p-1: Prädikat nicht auswertbar'], [])
  assert.ok(findings.indexOf('XML nicht wohlgeformt') < findings.indexOf('ODD')) // first, above the ODD
})

test('a page says where its poems and pages stand in the source, for the source view', () => {
  const doc: PreviewDoc = {
    file: 'x.xml', out: 'x.html', title: 'X', lang: 'de', html: '', text: '', notes: [], pages: [], facsRoot: null,
    entities: {}, warnings: [], source: { file: 'x.xml', ids: { n1: [3, 9] }, pages: { 17: [4, 4] } },
  }
  assert.match(documentPage(doc, []), /<script type="application\/json" data-source>\{"file":"x.xml","ids":\{"n1":\[3,9\]\},"pages":\{"17":\[4,4\]\}\}<\/script>/)
  assert.match(sourcePage('https://github.com/o/r/blob/main/tei'), /data-source-github="https:\/\/github.com\/o\/r\/blob\/main\/tei\/"[\s\S]*assets\/source.js/)
  assert.doesNotMatch(sourcePage(null), /GitHub/) // a source outside the repository has no place there
})

test('the drawer shows the XML beside the text, the facsimile too where there is one', () => {
  const doc: PreviewDoc = {
    file: 'x.xml', out: 'x.html', title: 'X', lang: 'de', html: '', text: '', notes: [], pages: [], facsRoot: null,
    entities: {}, warnings: [], source: { file: 'x.xml', ids: {}, pages: {} },
  }
  const xml = documentPage(doc, [])
  assert.match(xml, /<html [^>]*data-facs="off" data-facs-view="xml"/) // the XML alone waits to be asked for
  assert.match(xml, /data-xml-link target="simler-source" href="source.html\?x.xml"[\s\S]*data-xml-frame/)
  assert.doesNotMatch(xml, /data-facs-show|facs-frame/)
  assert.match(xml, /assets\/source.js[\s\S]*assets\/facsimile.js/)
  const both = documentPage({ ...doc, pages: ['1'], facsRoot: 'https://iiif.example/x' }, [])
  assert.match(both, /<html [^>]*data-facs="on" data-facs-view="facs"/)
  assert.match(both, /data-facs-show="facs" aria-pressed="true">Faksimile[\s\S]*data-facs-show="xml" aria-pressed="false">XML/)
  assert.doesNotMatch(documentPage({ ...doc, source: undefined }, []), /id="facsimile"|source.js/)
})
