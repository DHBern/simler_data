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

import {
  coverage, createProcessor, findFirst, parse, readOdd, renderTei, selectOutput,
  h, text, toHtml, type BehaviourSpec, type Decision, type Element, type Finding,
} from '../lib'

/** The smallest ODD that carries `specs`. */
const read = (specs: string, tokensCss?: string, behaviours?: Record<string, BehaviourSpec>) =>
  readOdd(
    `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><schemaSpec ident="t">${specs}</schemaSpec></body></text></TEI>`,
    { tokensCss, behaviours },
  )

const messages = (findings: Finding[]) => findings.map((f) => f.message).join('\n')

/** A `<p>` to select a model for. */
const paragraph = { node: findFirst(parse('<p>Text</p>'), 'p') as Element, up: [] }

test('an unreadable predicate is false, and says so', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <model predicate="@a | @b" behaviour="inline"/>
    <model behaviour="paragraph"/>
  </elementSpec>`)
  assert.equal(selectOutput(odd.models.p, paragraph)?.behaviour, 'paragraph')
  assert.match(messages(odd.findings), /Model p-1: predicate cannot be evaluated/)
})

test('a predicate that fails where it is evaluated is false too', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <model predicate="matches(., '[')" behaviour="inline"/>
    <model behaviour="paragraph"/>
  </elementSpec>`)
  assert.equal(odd.findings.length, 0) // it reads; only evaluating it fails
  assert.equal(selectOutput(odd.models.p, paragraph)?.behaviour, 'paragraph')
  assert.match(messages(odd.findings), /Model p-1: predicate cannot be evaluated/)
})

test('an unreadable param has no value', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <model behaviour="paragraph"><param name="content" value="let $x := 1"/></model>
  </elementSpec>`)
  assert.deepEqual(odd.models.p[0].params.content(paragraph), [])
  assert.match(messages(odd.findings), /param "content" cannot be evaluated/)
})

test('a param the behaviour does not read is a finding', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <model behaviour="paragraph"><param name="lable" value="'x'"/></model>
  </elementSpec>`)
  assert.match(messages(odd.findings), /"paragraph" does not read the param "lable"/)
})

test('a model behind one without a predicate can never be reached', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <model behaviour="paragraph"/>
    <model predicate="@rend" behaviour="block" cssClass="x"/>
  </elementSpec>`)
  assert.match(messages(odd.findings), /Model p-2: never reached/)
})

test('a model group decides as a whole, even when none of its models holds', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <modelGrp>
      <model predicate="@rend" behaviour="block" cssClass="x"/>
      <model predicate="@n" behaviour="block" cssClass="y"/>
    </modelGrp>
    <model behaviour="paragraph"/>
  </elementSpec>`)
  assert.equal(selectOutput(odd.models.p, paragraph), undefined)
  assert.match(messages(odd.findings), /Model p-3: never reached, the group from p-1 already decides/)
  assert.doesNotMatch(messages(odd.findings), /p-2/) // its own group does not hide it
})

test('a custom property is defined by the tokens, the CSS or a param', () => {
  const spec = (property: string) => `<elementSpec ident="p" mode="change">
    <model behaviour="paragraph"><outputRendition>color: var(${property});</outputRendition></model>
  </elementSpec>`
  assert.match(messages(read(spec('--nowhere')).findings), /CSS: --nowhere is not defined anywhere/)
  assert.equal(read(spec('--c-ink'), ':root { --c-ink: 0 0 0; }').findings.length, 0)
})

test('the header\'s availability travels into the generated CSS', () => {
  const odd = readOdd(`<TEI xmlns="http://www.tei-c.org/ns/1.0">
    <teiHeader><fileDesc><publicationStmt><publisher>X</publisher><availability>
      <licence target="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0, not */ a comment end</licence>
    </availability></publicationStmt></fileDesc></teiHeader>
    <text><body><schemaSpec ident="t"/></body></text></TEI>`)
  assert.deepEqual(odd.availability, {
    text: 'CC BY 4.0, not */ a comment end',
    licence: 'https://creativecommons.org/licenses/by/4.0/',
  })
  assert.match(odd.css, /^\/\*[^]*CC BY 4\.0, not \* \/ a comment end https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/ \*\/\n/)
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
  const gaps = messages(coverage(odd))
  assert.match(gaps, /Model p-1: never fires/) // nothing here carries @rend
  assert.match(gaps, /<lg>: not in the corpus/)
  assert.match(gaps, /<quote>: no model in the ODD/)
  assert.doesNotMatch(gaps, /Model p-2/) // it fired
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

/** One `p`, by the given model, through the whole pipeline. */
const renderBy = (model: string, behaviours?: Record<string, BehaviourSpec>) => {
  const odd = read(`<elementSpec ident="p" mode="change">${model}</elementSpec>
    <elementSpec ident="q" mode="change"><model behaviour="inline"/></elementSpec>`, undefined, behaviours)
  return { odd, result: renderTei(parse('<p>a <q>b</q></p>'), createProcessor(odd)) }
}

test('figure, figDesc and index are behaviours', () => {
  const figure = renderBy(`<model behaviour="figure"><param name="title" value="'t'"/></model>`)
  assert.deepEqual(figure.odd.findings, [])
  assert.equal(figure.result.html, '<figure class="tei-p"><figcaption>t</figcaption>a <span class="tei-q">b</span></figure>')
  assert.match(renderBy('<model behaviour="figDesc"/>').result.html, /^<figcaption class="tei-p">/)
  // As TEI Simple Print's `body` has it: the index asked for, and the text once.
  const body = renderBy(`<modelSequence><model behaviour="index"><param name="type" value="'toc'"/></model><model behaviour="block"/></modelSequence>`)
  assert.equal(body.result.html, '<div class="tei-p">a <span class="tei-q">b</span></div>')
})

test('an unknown behaviour is a finding, and its element still shows its text', () => {
  const { odd, result } = renderBy(`<model behaviour="pb-x"><param name="any" value="'v'"/></model>`)
  assert.deepEqual(odd.findings.map((f) => f.code), ['behaviour-unknown'])
  assert.equal(result.html, '<span class="tei-p">a <span class="tei-q">b</span></span>')
})

test('a project brings its own behaviours, and may replace one', () => {
  const own = renderBy(`<model behaviour="stamp"><param name="by" value="'x'"/></model>`, {
    stamp: { flow: 'block', params: ['by'], render: (c) => h('aside', { ...c.props, title: 'by' }, c.content('aside')) },
  })
  assert.deepEqual(own.odd.findings, [])
  assert.equal(own.result.html, '<aside class="tei-p" title="by">a <span class="tei-q">b</span></aside>')
  assert.match(renderBy('<model behaviour="paragraph"/>', { paragraph: { tag: 'section', flow: 'block' } }).result.html, /^<section /)
})

test('a styled model without @cssClass, or without @behaviour, does not stop the build', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <model predicate="@a" behaviour="block"><outputRendition>color: red;</outputRendition></model>
    <model/>
  </elementSpec>`)
  assert.deepEqual(odd.findings.map((f) => f.code), ['css-class-missing', 'behaviour-missing'])
  assert.match(odd.css, /\.p-1 \{ color: red; \}/)
})

test('what the ODD asks for and is not read is a finding', () => {
  const odd = readOdd(`<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
    <schemaSpec ident="a" source="parent.odd"><elementSpec ident="p"><model behaviour="block"/></elementSpec></schemaSpec>
    <schemaSpec ident="b"/>
  </body></text></TEI>`)
  assert.deepEqual(odd.findings.map((f) => f.code), ['chain-not-followed', 'schema-spec-ignored'])
})

test('the result carries the page and the notes as trees', () => {
  const { result } = renderBy('<model behaviour="note"/>')
  assert.equal(toHtml(result.hast), result.html)
  assert.equal(toHtml(result.notes[0].hast), result.notes[0].html)
})

test('HTML is escaped as the standard serialiser escapes it', () => {
  const tree = h('a', { className: ['x', 'y'], href: `?a=1&b="'\``, id: undefined, hidden: true, alt: '' }, [
    text('<&>"\''), h('br', {}),
  ])
  assert.equal(toHtml(tree), '<a class="x y" href="?a=1&#x26;b=&#x22;&#x27;&#x60;" hidden alt="">&#x3C;&#x26;>"\'<br></a>')
})

test('a note in any place has a marker, unless its model says not', () => {
  const place = `<param name="place" value="'foot'"/>`
  const marked = renderBy(`<model behaviour="note">${place}</model>`).result
  assert.match(marked.html, /^<a class="note-marker tei-p" id="ref-note-1" href="#note-1"/)
  assert.equal(marked.notes[0].place, 'foot')
  assert.equal(marked.notes[0].number, 1)
  assert.equal(marked.text, '') // the search text has no markers
  const unmarked = renderBy(`<model behaviour="note">${place}<param name="marker" value="false()"/></model>`).result
  assert.equal(unmarked.html, '')
  assert.equal(unmarked.notes[0].number, undefined)
})

/** An ODD with the given text in its `<body>`. */
const whole = (body: string) => readOdd(`<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>${body}</body></text></TEI>`)
const P = '<elementSpec ident="p"><model behaviour="paragraph"/></elementSpec>'

test('specs are read through the groups a schemaSpec refers to, however nested', () => {
  const odd = whole(`<schemaSpec ident="a"><specGrpRef target="#outer"/><specGrpRef target="#outer"/></schemaSpec>
    <specGrp xml:id="outer">${P}<specGrpRef target="#inner"/></specGrp>
    <specGrp xml:id="inner"><elementSpec ident="q"><model behaviour="inline"/></elementSpec><specGrpRef target="#outer"/></specGrp>
    <specGrp xml:id="unused"><elementSpec ident="r"><model behaviour="inline"/></elementSpec></specGrp>`)
  assert.deepEqual(Object.keys(odd.models), ['p', 'q'])
  assert.deepEqual(odd.findings, [])
})

test('a group that cannot be found, or an ODD without models, is an error', () => {
  const odd = whole(`<schemaSpec ident="a"><specGrpRef target="other.xml#g"/></schemaSpec>`)
  assert.deepEqual(odd.findings.map((f) => [f.code, f.severity]), [['spec-group-not-found', 'error'], ['no-models', 'error']])
})

test('a flattened ODD, and a schemaSpec in an example, are not findings', () => {
  const flat = whole(`<schemaSpec ident="a" source="https://www.tei-c.org/Vault/P5/current/xml/tei/odd/p5subset.xml">${P}</schemaSpec>`)
  assert.deepEqual(flat.findings, [])
  assert.deepEqual(whole(`<schemaSpec ident="a" source="tei:4.9.0">${P}</schemaSpec>`).findings, [])
  const examples = whole(`<egXML xmlns="http://www.tei-c.org/ns/Examples"><schemaSpec ident="ex"/></egXML><schemaSpec ident="a">${P}
    <elementSpec ident="q"><exemplum><egXML><schemaSpec ident="myODD" source="my.xml"/></egXML></exemplum><model behaviour="inline"/></elementSpec></schemaSpec>`)
  assert.deepEqual(examples.findings, [])
  assert.deepEqual(Object.keys(examples.models), ['p', 'q'])
})

test('findings say how much they matter', () => {
  const odd = read(`<elementSpec ident="p" mode="change">
    <model predicate="@a | @b" behaviour="inline"/>
    <model predicate="@c" behaviour="pb-x"/>
    <model behaviour="block"><outputRendition>color: red;</outputRendition></model>
  </elementSpec>`)
  assert.deepEqual(odd.findings.map((f) => [f.code, f.severity]), [
    ['behaviour-unknown', 'warning'], ['css-class-missing', 'info'],
  ])
  assert.ok(!odd.findings.some((f) => f.severity === 'error'))
  selectOutput(odd.models.p, paragraph)
  assert.deepEqual(odd.findings.at(-1)?.severity, 'error') // unreadable, once it is evaluated
})

test('only an output over the page is a view', () => {
  const specs = `<elementSpec ident="p" mode="change">
    <model output="print latex" behaviour="omit"/>
    <model output="web print epub" predicate="@a" behaviour="block" cssClass="w"/>
    <model output="plain" behaviour="omit"/>
    <model output="page" behaviour="metadata"/>
    <model output="reading other" behaviour="inline"><desc>Lesen</desc></model>
    <model behaviour="paragraph"/>
  </elementSpec>`
  const odd = read(specs)
  assert.deepEqual(odd.views.map((v) => v.output), ['reading', 'other'])
  assert.deepEqual(odd.models.p.map((m) => m.output), ['web', 'plain', 'page', 'reading', 'other', undefined])
  assert.doesNotMatch(odd.css, /data-(plain|page|print|latex)|view-(plain|page|print)/)
  assert.match(odd.css, /\[data-reading='on'\]/)
  const asked = readOdd(`<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><schemaSpec ident="t">${specs}</schemaSpec></body></text></TEI>`, { ignoredOutputs: [] })
  assert.deepEqual(asked.views.map((v) => v.output), ['print', 'latex', 'epub', 'reading', 'other'])
})

/** One document through the whole pipeline, by the given specs. */
const renderWith = (odd: ReturnType<typeof readOdd>, body: string) =>
  renderTei(parse(`<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>${body}</body></text></TEI>`), createProcessor(odd))
const SHELL = `<elementSpec ident="TEI"><model behaviour="text"/></elementSpec><elementSpec ident="text"><model behaviour="text"/></elementSpec>
  <elementSpec ident="body"><model behaviour="text"/></elementSpec>`

test('only a value outside a closed list is a warning, unless more lists are asked for', () => {
  const list = (type: string) => `<attDef ident="${type}"><valList${type === 'none' ? '' : ` type="${type}"`}><valItem ident="x"/></valList></attDef>`
  const specs = `${SHELL}<elementSpec ident="p"><attList>${['closed', 'semi', 'open', 'none'].map(list).join('')}</attList><model behaviour="paragraph"/></elementSpec>`
  const doc = '<p closed="y" semi="y" open="y" none="y">a</p>'
  const warned = (odd: ReturnType<typeof readOdd>) => renderWith(odd, doc).warnings.map((w) => w.args.attribute)
  assert.deepEqual(warned(read(specs)), ['closed'])
  const asked = readOdd(`<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><schemaSpec ident="t">${specs}</schemaSpec></body></text></TEI>`, { checkedValueLists: ['closed', 'semi'] })
  assert.deepEqual(warned(asked), ['closed', 'semi'])
})

test('a label that selects nothing is no label; an empty string is one', () => {
  const odd = read(`${SHELL}<elementSpec ident="p"><model behaviour="paragraph"/></elementSpec>
    <elementSpec ident="lb"><model behaviour="break"><param name="type" value="'line'"/><param name="label" value="@n"/></model></elementSpec>
    <elementSpec ident="cb"><model behaviour="break"><param name="type" value="'column'"/><param name="label" value="''"/></model></elementSpec>`)
  assert.equal(renderWith(odd, '<p>a<lb/>b<lb n="2"/>c<cb/>d</p>').html,
    '<p class="tei-p">a<br class="tei-lb">b<span class="tei-lb">2</span><br class="tei-lb">c<span class="tei-cb"></span>d</p>')
})

test('a source rendition comes by pointer or by prefix, and its style with it', () => {
  const odd = whole(`<listPrefixDef><prefixDef ident="simple" matchPattern="([a-z]+)" replacementPattern="https://example.org/simple.odd#$1"/></listPrefixDef>
    <tagsDecl><rendition xml:id="b">font-weight: bold;</rendition><rendition xml:id="allcaps">text-transform: uppercase;</rendition></tagsDecl>
    <schemaSpec ident="t">${SHELL}<elementSpec ident="p"><model behaviour="paragraph" useSourceRendition="true"><param name="--x" value="'1'"/></model></elementSpec></schemaSpec>`)
  const result = renderWith(odd, '<p rendition="#b simple:allcaps other:b" style="color: red">a</p>')
  assert.equal(result.html, '<p class="tei-p r-b r-allcaps r-b" style="color: red; --x: 1">a</p>')
  assert.deepEqual(result.warnings, [])
})
