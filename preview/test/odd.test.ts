/**
 * Reading the ODD: what a flaw in it costs. An expression the XPath subset cannot
 * read, or that fails where it is evaluated, must leave the rest of the ODD working
 * and turn up as a finding — never as a build that writes no pages at all. The
 * checks that need no corpus are here too.
 *
 *     node --import tsx --test test/odd.test.ts
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readOdd, selectOutput } from '../lib/odd/odd'
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
  assert.match([...odd.findings].join('\n'), /p, Modell 1: Prädikat nicht auswertbar/)
})

test('a predicate that fails where it is evaluated is false too', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <model predicate="matches(., '[')" behaviour="inline"/>
    <model behaviour="paragraph"/>
  </elementSpec>`)
  assert.equal(odd.findings.size, 0) // it reads; only evaluating it fails
  assert.equal(selectOutput(odd.models.p, paragraph)?.behaviour, 'paragraph')
  assert.match([...odd.findings].join('\n'), /p, Modell 1: Prädikat nicht auswertbar/)
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
  assert.match([...odd.findings].join('\n'), /p, Modell 2: nie erreichbar/)
})

test('a custom property is defined by the tokens, the CSS or a param', () => {
  const spec = (property: string) => `<elementSpec ident="p" mode="change">
    <model behaviour="paragraph"><outputRendition>color: var(${property});</outputRendition></model>
  </elementSpec>`
  assert.match([...read(spec('--nowhere')).findings].join('\n'), /CSS: --nowhere ist nirgends definiert/)
  assert.equal(read(spec('--c-ink'), ':root { --c-ink: 0 0 0; }').findings.size, 0)
})
