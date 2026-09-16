/**
 * Reading the ODD: what a flaw in it costs, and what it says about itself. An
 * expression the XPath subset cannot read, or that fails where it is evaluated,
 * must leave the rest of the ODD working and turn up as a finding — never as a
 * build that writes no pages at all. The checks that need no corpus are here too,
 * and the two reports that read a rendering back against the ODD.
 *
 *     node --import tsx --test test/odd.test.ts
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { coverage, readOdd, selectOutput } from '../lib/odd/odd'
import { createProcessor, renderTei } from '../lib/tei/render'
import type { Decision } from '../lib/tei/teiToHast'
import { findFirst, parse, type Element } from '../lib/tei/xast'

/** The smallest ODD that carries `specs`. */
const read = (specs: string, tokensCss?: string) =>
  readOdd(
    `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><schemaSpec ident="t">${specs}</schemaSpec></body></text></TEI>`,
    tokensCss,
  )

/** A `<p>` to select a model for. */
const paragraph = { node: findFirst(parse('<p>Text</p>'), 'p') as Element, up: [] }

test('an unreadable predicate is false, and says so', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <model predicate="@a | @b" behaviour="inline"/>
    <model behaviour="paragraph"/>
  </elementSpec>`)
  assert.equal(selectOutput(odd.models.p, paragraph)?.behaviour, 'paragraph')
  assert.match([...odd.findings].join('\n'), /Modell p-1: Prädikat nicht auswertbar/)
})

test('a predicate that fails where it is evaluated is false too', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <model predicate="matches(., '[')" behaviour="inline"/>
    <model behaviour="paragraph"/>
  </elementSpec>`)
  assert.equal(odd.findings.size, 0) // it reads; only evaluating it fails
  assert.equal(selectOutput(odd.models.p, paragraph)?.behaviour, 'paragraph')
  assert.match([...odd.findings].join('\n'), /Modell p-1: Prädikat nicht auswertbar/)
})

test('an unreadable param has no value', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <model behaviour="paragraph"><param name="content" value="let $x := 1"/></model>
  </elementSpec>`)
  assert.deepEqual(odd.models.p[0].params.content(paragraph), [])
  assert.match([...odd.findings].join('\n'), /Parameter "content" nicht auswertbar/)
})

test('a param the behaviour does not read is a finding', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <model behaviour="paragraph"><param name="lable" value="'x'"/></model>
  </elementSpec>`)
  assert.match([...odd.findings].join('\n'), /"paragraph" liest den Parameter "lable" nicht/)
})

test('a model behind one without a predicate can never be reached', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <model behaviour="paragraph"/>
    <model predicate="@rend" behaviour="block" cssClass="x"/>
  </elementSpec>`)
  assert.match([...odd.findings].join('\n'), /Modell p-2: nie erreichbar/)
})

test('a custom property is defined by the tokens, the CSS or a param', () => {
  const spec = (property: string) => `<elementSpec ident="p" mode="change">
    <model behaviour="paragraph"><outputRendition>color: var(${property});</outputRendition></model>
  </elementSpec>`
  assert.match([...read(spec('--nowhere')).findings].join('\n'), /CSS: --nowhere ist nirgends definiert/)
  assert.equal(read(spec('--c-ink'), ':root { --c-ink: 0 0 0; }').findings.size, 0)
})

test('the views are the outputs laid over the page, named by the ODD', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <model behaviour="paragraph"/>
    <model output="entities" behaviour="inline"/>
    <model output="normalized" behaviour="inline">
      <desc>Normalisiert</desc>
      <desc>Lesetext.</desc>
    </model>
    <model output="plain" behaviour="omit"/>
    <model output="web" behaviour="paragraph"/>
  </elementSpec>`)
  // `web`, `page` and `plain` render on their own; the rest are switches, in the ODD's order.
  assert.deepEqual(odd.views, [
    { output: 'entities', label: 'entities', title: undefined },
    { output: 'normalized', label: 'Normalisiert', title: 'Lesetext.' },
  ])
})

/** Two models for `p`, of which a plain one takes the second, and an element the corpus below has not. */
const SPECS = `<elementSpec ident="p" mode="change">
    <model predicate="@rend" behaviour="block" cssClass="x"><param name="data-rend" value="@rend"/></model>
    <model behaviour="paragraph"/>
  </elementSpec>
  <elementSpec ident="TEI" mode="change"><model behaviour="text"/></elementSpec>
  <elementSpec ident="text" mode="change"><model behaviour="text"/></elementSpec>
  <elementSpec ident="body" mode="change"><model behaviour="text"/></elementSpec>
  <elementSpec ident="lg" mode="change"><model behaviour="block"/></elementSpec>`

/** A document through the whole pipeline, which is what the reports read back. */
const render = (body: string, decisions = false) => {
  const odd = read(SPECS)
  const xml = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>${body}</body></text></TEI>`
  return { odd, result: renderTei(parse(xml), createProcessor(odd), decisions) }
}

test('coverage says what never ran and what was never handled', () => {
  const { odd } = render('<p>Erster</p><quote>Zitat</quote>')
  const gaps = coverage(odd).join('\n')
  assert.match(gaps, /Modell p-1: greift nie/) // nothing here carries @rend
  assert.match(gaps, /<lg>: im Korpus nicht vorgekommen/)
  assert.match(gaps, /<quote>: kein Modell in der ODD/)
  assert.doesNotMatch(gaps, /Modell p-2/) // it fired
})

test('the decisions name the model that won', () => {
  const { result } = render('<p rend="c">Erster</p>', true)
  const text = result.decisions!.children[0] as Decision
  const [body] = text.children as [Decision]
  const [p] = body.children as [Decision]
  assert.equal(p.element, 'p')
  assert.equal(p.model, 'p-1')
  assert.equal(p.behaviour, 'block')
  assert.deepEqual(p.classes, ['tei-p', 'x'])
  assert.deepEqual(p.params, { 'data-rend': ['c'] })
  assert.deepEqual(p.children, ['Erster'])
})
